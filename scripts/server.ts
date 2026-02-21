import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { PrismaClient, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import multer from 'multer';

const app = express();
const prisma = new PrismaClient();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../web')));

app.get('/api/alipay', async (_req: Request, res: Response) => {
  const data = await prisma.alipayTransaction.findMany({
    orderBy: { transactionTime: 'desc' }
  });
  res.json(data);
});

app.get('/api/wechat', async (_req: Request, res: Response) => {
  const data = await prisma.wechatTransaction.findMany({
    orderBy: { transactionTime: 'desc' }
  });
  res.json(data);
});

app.get('/api/unified', async (req: Request, res: Response) => {
  const { startDate, endDate, categories, transactionTypes, sortBy, sortOrder } = req.query;
  
  // Build where clause
  const where: any = {};
  
  // Time range filter
  if (startDate || endDate) {
    where.transactionTime = {};
    if (startDate) where.transactionTime.gte = new Date(startDate as string);
    if (endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      where.transactionTime.lte = end;
    }
  }
  
  // Category filter (multiple) - supports empty category with special marker
  if (categories) {
    const categoryList = (categories as string).split(',').filter(Boolean);
    if (categoryList.length > 0) {
      const hasEmpty = categoryList.includes('__empty__');
      const normalCategories = categoryList.filter(c => c !== '__empty__');
      
      if (hasEmpty && normalCategories.length > 0) {
        where.OR = [
          { category: { in: normalCategories } },
          { category: null },
          { category: '' }
        ];
      } else if (hasEmpty) {
        where.OR = [{ category: null }, { category: '' }];
      } else {
        where.category = { in: normalCategories };
      }
    }
  }
  
  // Transaction type filter (INCOME, EXPENSE, OTHER)
  if (transactionTypes) {
    const typeList = (transactionTypes as string).split(',').filter(Boolean);
    if (typeList.length > 0) {
      where.transactionType = { in: typeList };
    }
  }
  
  // Build orderBy
  let orderBy: any = { transactionTime: 'desc' };
  if (sortBy === 'amount') {
    orderBy = { amount: sortOrder === 'asc' ? 'asc' : 'desc' };
  } else if (sortBy === 'time') {
    orderBy = { transactionTime: sortOrder === 'asc' ? 'asc' : 'desc' };
  }
  
  const data = await prisma.unifiedTransaction.findMany({
    where,
    orderBy
  });
  res.json(data);
});

app.get('/api/categories', async (_req: Request, res: Response) => {
  const result = await prisma.unifiedTransaction.groupBy({
    by: ['category'],
    _count: { category: true },
    orderBy: { _count: { category: 'desc' } }
  });
  
  const emptyCount = await prisma.unifiedTransaction.count({
    where: { OR: [{ category: null }, { category: '' }] }
  });
  
  const categories = result
    .filter(r => r.category && r.category !== '')
    .map((r) => ({ 
      name: r.category || '', 
      count: r._count.category,
      isEmpty: false
    }));
  
  if (emptyCount > 0) {
    categories.push({ name: '', count: emptyCount, isEmpty: true });
  }
  
  res.json(categories);
});

app.patch('/api/unified/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { category, reviewStatus, counterparty, description } = req.body;
  
  const updateData: any = {};
  if (category !== undefined) updateData.category = category;
  if (reviewStatus !== undefined) updateData.reviewStatus = reviewStatus;
  if (counterparty !== undefined) updateData.counterparty = counterparty;
  if (description !== undefined) updateData.description = description;
  
  const updated = await prisma.unifiedTransaction.update({
    where: { id },
    data: updateData
  });
  res.json(updated);
});

app.post('/api/unified/:id/approve', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const updated = await prisma.unifiedTransaction.update({
    where: { id },
    data: { reviewStatus: 'approved' }
  });
  res.json(updated);
});

app.post('/api/categories/rename', async (req: Request, res: Response) => {
  const { oldName, newName } = req.body;
  
  if (!oldName || !newName) {
    return res.status(400).json({ error: 'oldName and newName required' });
  }
  
  const result = await prisma.unifiedTransaction.updateMany({
    where: { category: oldName },
    data: { category: newName }
  });
  
  res.json({ updated: result.count });
});

// ==================== 数据分析 API ====================

app.get('/api/analysis/monthly', async (req: Request, res: Response) => {
  const { yearMonth } = req.query;
  if (!yearMonth) {
    return res.status(400).json({ error: 'yearMonth required' });
  }
  
  const [year, month] = (yearMonth as string).split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  
  const transactions = await prisma.unifiedTransaction.findMany({
    where: {
      transactionTime: { gte: startDate, lte: endDate },
      transactionType: 'EXPENSE',
      category: { not: '转账' }
    }
  });
  
  const summary: Record<string, { amount: number; count: number }> = {};
  let total = 0;
  
  for (const t of transactions) {
    const cat = t.category || '未分类';
    if (!summary[cat]) summary[cat] = { amount: 0, count: 0 };
    const amt = Number(t.amount);
    summary[cat].amount += amt;
    summary[cat].count += 1;
    total += amt;
  }
  
  const result = Object.entries(summary)
    .map(([category, data]) => ({
      category,
      amount: Math.round(data.amount * 100) / 100,
      count: data.count,
      percent: total > 0 ? Math.round(data.amount / total * 1000) / 10 : 0
    }))
    .sort((a, b) => b.amount - a.amount);
  
  res.json({ summary: result, total: Math.round(total * 100) / 100 });
});

app.get('/api/analysis/top10', async (req: Request, res: Response) => {
  const { yearMonth } = req.query;
  if (!yearMonth) {
    return res.status(400).json({ error: 'yearMonth required' });
  }
  
  const [year, month] = (yearMonth as string).split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  
  const transactions = await prisma.unifiedTransaction.findMany({
    where: {
      transactionTime: { gte: startDate, lte: endDate },
      transactionType: 'EXPENSE',
      category: { not: '转账' }
    },
    orderBy: { amount: 'desc' },
    take: 10
  });
  
  res.json(transactions);
});

app.get('/api/analysis/months', async (_req: Request, res: Response) => {
  const transactions = await prisma.unifiedTransaction.findMany({
    select: { transactionTime: true },
    orderBy: { transactionTime: 'asc' }
  });
  
  const months = new Set<string>();
  for (const t of transactions) {
    const d = new Date(t.transactionTime);
    months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  
  res.json(Array.from(months).sort().reverse());
});

// ==================== 预算模板 API ====================

app.get('/api/budget', async (_req: Request, res: Response) => {
  const budgets = await prisma.budgetTemplate.findMany({
    orderBy: { category: 'asc' }
  });
  res.json(budgets);
});

app.post('/api/budget', async (req: Request, res: Response) => {
  const { category, amount } = req.body;
  const budget = await prisma.budgetTemplate.upsert({
    where: { category },
    update: { amount },
    create: { category, amount }
  });
  res.json(budget);
});

app.put('/api/budget/batch', async (req: Request, res: Response) => {
  const budgets: { category: string; amount: number }[] = req.body;
  
  for (const b of budgets) {
    await prisma.budgetTemplate.upsert({
      where: { category: b.category },
      update: { amount: b.amount },
      create: { category: b.category, amount: b.amount }
    });
  }
  
  const all = await prisma.budgetTemplate.findMany({ orderBy: { category: 'asc' } });
  res.json(all);
});

// ==================== 导入功能 API ====================

const UPLOADS_DIR = path.join(__dirname, '../uploads');
const upload = multer({ dest: UPLOADS_DIR });

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseAlipayTime(timeStr: string): Date | null {
  if (!timeStr) return null;
  try {
    const [datePart, timePart] = timeStr.split(' ');
    const [year, month, day] = datePart.split('/').map(Number);
    const [hour, minute] = (timePart || '0:0').split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute);
  } catch {
    return null;
  }
}

function parseWechatTime(timeStr: any): Date | null {
  if (!timeStr) return null;
  try {
    if (typeof timeStr === 'number') {
      return new Date((timeStr - 25569) * 86400 * 1000);
    }
    return new Date(String(timeStr));
  } catch {
    return null;
  }
}

type TransactionType = 'EXPENSE' | 'INCOME' | 'OTHER';

function normalizeTransactionType(incomeExpense: string): TransactionType {
  const normalized = incomeExpense.trim();
  if (normalized === '支出') return 'EXPENSE';
  if (normalized === '收入') return 'INCOME';
  return 'OTHER';
}

interface CategoryRule {
  keywords: string[];
  counterparties: string[];
}

const CATEGORY_RULES: Record<string, CategoryRule> = {
  '手工爱好': {
    keywords: ['编织', '毛线', '布料', '面料', '缝纫', '裁剪', '刺绣', '刺子绣', '染色', '染料', '织布', '织毛衣', '手工DIY', '羊毛白胚', '手编', '棉线'],
    counterparties: ['乐编', '布亦', '糯米染艺', '那**', '羊绒']
  },
  '吃饭': {
    keywords: ['餐', '饭', '面', '食', '吃', '烧烤', '火锅', '麻辣烫', '奶茶', '炸鸡', '小吃', '美食', '快餐', '外卖', '点餐', '堂食', '美团收银', '饿了么', '糖水', '冰城', '锅盔'],
    counterparties: ['麦当劳', '肯德基', '大米先生', '绝味', '德华楼', '马记永', '遇见小面', '汽水包', '常青麦香园', '喜欢喝汤', '陈小蛮', '火焰杯', '玖煲王', '希玟柴火鸡', '王老幺麻辣烫', '好美鲜', '盒马', '山姆', '沃尔玛', 'WALMART', '余庭华餐饮', '可口可乐', '可多', '辜梅', '鹅当家', '蜜雪冰城']
  },
  '旅游': {
    keywords: ['景点', '门票', '寺', '禅', '滑雪', '旅行', '民宿', '酒店', '机票', '火车票', '知音号'],
    counterparties: ['同程旅行', '归元禅寺', '古德寺', '滑雪场', '径山万寿禅寺', '阿斯兰航空', '铁路12306']
  },
  '出行': {
    keywords: ['打车', '专车', '快车', '先乘后付', '骑行', '单车', '地铁', '公交', '有轨电车', '先骑后付'],
    counterparties: ['滴滴', '花小猪', '北京鸿易博', '武汉地铁', '杭州杭港地铁', '光谷交通']
  },
  '工作': {
    keywords: ['云服务', '认证', '企业', '小程序', '服务器'],
    counterparties: ['腾讯云', '微信/企业微信认证', 'LiblibAI']
  },
  '服饰化妆': {
    keywords: ['服装', '服饰', '首饰', '饰品', '美甲', '造型', '化妆品', '护肤', '口红', '面膜'],
    counterparties: ['UNIQLO', '优衣库', '哭喊中心', '东广场', '川和造型', 'HARMAY', '话梅']
  },
  '娱乐': {
    keywords: ['预售', '玩偶', '手办', '电影', '演出', '游戏'],
    counterparties: ['鱼干的小星球', '微店', '淘票', '星聚汇']
  },
  '慈善': {
    keywords: ['筹款', '捐', '公益', '爱心'],
    counterparties: ['水滴筹', 'EMS中国邮政']
  },
  '日用百货': {
    keywords: ['日用', '百货', '超市'],
    counterparties: ['拼多多', '小红书', '奥乐齐']
  },
  '转账': {
    keywords: ['信用卡还款', '花呗主动还款', '花呗账单', '基金买入', '基金卖出', 'ETF', '转出到银行卡'],
    counterparties: []
  }
};

function classifyTransaction(counterparty: string, description: string): string | null {
  const text = `${counterparty} ${description}`;
  const textLower = text.toLowerCase();
  
  if (counterparty.includes('中银基金管理有限公司') && description.includes('余额宝') && description.includes('收益发放')) {
    return '转账';
  }
  if (description.includes('信用卡还款') || description.includes('花呗主动还款') || description.includes('花呗账单')) {
    return '转账';
  }
  if (description.includes('基金') || description.includes('ETF') || description.includes('转出到银行卡')) {
    return '转账';
  }
  if (counterparty === '花呗' || counterparty.includes('信用卡')) {
    return '转账';
  }
  
  if (counterparty === '美团') {
    if (description.includes('先骑后付')) return '出行';
    if (description.includes('知音号') || description.includes('滑雪')) return '旅游';
    if (description.includes('糖水') || description.includes('冰城') || description.includes('锅盔') || 
        description.includes('蜜雪') || description.includes('家宴') || description.includes('餐') ||
        description.includes('饭') || description.includes('面')) return '吃饭';
  }
  
  for (const [category, rule] of Object.entries(CATEGORY_RULES)) {
    for (const cp of rule.counterparties) {
      if (counterparty.includes(cp) || cp.includes(counterparty.slice(0, 3))) {
        return category;
      }
    }
  }
  
  for (const [category, rule] of Object.entries(CATEGORY_RULES)) {
    for (const kw of rule.keywords) {
      if (textLower.includes(kw.toLowerCase())) {
        return category;
      }
    }
  }
  
  if (counterparty.includes('红包') || description.includes('红包')) {
    return '其他';
  }
  
  if (description.includes('转账') || counterparty.includes('转账')) {
    return null;
  }
  
  return null;
}

async function syncRecordToUnified(
  source: 'alipay' | 'wechat',
  record: any
): Promise<{ id: string; isNew: boolean }> {
  const existing = await prisma.unifiedTransaction.findUnique({
    where: { source_sourceId: { source, sourceId: record.id } }
  });
  
  const incomeExpense = source === 'wechat' 
    ? (record.incomeExpense === '/' ? '不计收支' : record.incomeExpense)
    : record.incomeExpense;
  
  const description = source === 'wechat'
    ? (record.product || record.transactionType)
    : record.productDescription;
  
  const unified = await prisma.unifiedTransaction.upsert({
    where: { source_sourceId: { source, sourceId: record.id } },
    update: {
      transactionTime: record.transactionTime,
      amount: record.amount,
      transactionType: normalizeTransactionType(incomeExpense),
      category: record.myCategory,
      description,
      counterparty: record.counterparty,
    },
    create: {
      transactionTime: record.transactionTime,
      amount: record.amount,
      transactionType: normalizeTransactionType(incomeExpense),
      category: record.myCategory,
      description,
      counterparty: record.counterparty,
      source,
      sourceId: record.id,
    },
  });
  
  return { id: unified.id, isNew: !existing };
}

async function autoClassifyRecord(unifiedId: string): Promise<void> {
  const record = await prisma.unifiedTransaction.findUnique({ where: { id: unifiedId } });
  if (!record || record.category) return;
  
  const category = classifyTransaction(record.counterparty, record.description);
  if (category) {
    await prisma.unifiedTransaction.update({
      where: { id: unifiedId },
      data: { category, reviewStatus: 'pending' }
    });
  }
}

app.post('/api/import/alipay', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const content = fs.readFileSync(req.file.path, 'utf-8');
    const lines = content.split('\n');
    
    const dataStartIndex = 25;
    let imported = 0;
    let skipped = 0;
    const times: Date[] = [];
    const newRecordIds: string[] = [];
    
    for (let i = dataStartIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const fields = parseCSVLine(line);
      if (fields.length < 10) continue;
      
      const [
        transactionTime, transactionCategory, counterparty, counterpartyAccount,
        productDescription, incomeExpense, amountStr, paymentMethod,
        transactionStatus, transactionOrderNo, merchantOrderNo, remark,
        myCategory, remarkDescription
      ] = fields;
      
      const cleanOrderNo = transactionOrderNo?.replace(/[\t"]/g, '').trim();
      if (!cleanOrderNo) continue;
      
      const amount = parseFloat(amountStr) || 0;
      const parsedTime = parseAlipayTime(transactionTime);
      if (!parsedTime) continue;
      
      const existing = await prisma.alipayTransaction.findUnique({
        where: { transactionOrderNo: cleanOrderNo }
      });
      
      if (existing) {
        skipped++;
        continue;
      }
      
      try {
        const record = await prisma.alipayTransaction.create({
          data: {
            transactionTime: parsedTime,
            transactionCategory: transactionCategory?.trim() || '',
            counterparty: counterparty?.trim() || '',
            counterpartyAccount: counterpartyAccount?.trim() || null,
            productDescription: productDescription?.trim() || '',
            incomeExpense: incomeExpense?.trim() || '',
            amount: new Prisma.Decimal(amount),
            paymentMethod: paymentMethod?.trim() || null,
            transactionStatus: transactionStatus?.trim() || '',
            transactionOrderNo: cleanOrderNo,
            merchantOrderNo: merchantOrderNo?.replace(/[\t"]/g, '').trim() || null,
            remark: remark?.trim() || null,
            myCategory: myCategory?.trim() || null,
            remarkDescription: remarkDescription?.trim() || null,
          },
        });
        
        const { id: unifiedId } = await syncRecordToUnified('alipay', record);
        newRecordIds.push(unifiedId);
        times.push(parsedTime);
        imported++;
      } catch (error) {
        skipped++;
      }
    }
    
    for (const unifiedId of newRecordIds) {
      await autoClassifyRecord(unifiedId);
    }
    
    const timestamp = Date.now();
    const savedFileName = `${timestamp}_${originalName}`;
    const savedPath = path.join(UPLOADS_DIR, savedFileName);
    fs.renameSync(req.file.path, savedPath);
    
    const startTime = times.length > 0 ? new Date(Math.min(...times.map(t => t.getTime()))) : new Date();
    const endTime = times.length > 0 ? new Date(Math.max(...times.map(t => t.getTime()))) : new Date();
    
    await prisma.importRecord.create({
      data: {
        fileName: originalName,
        source: 'alipay',
        filePath: savedFileName,
        importedCount: imported,
        skippedCount: skipped,
        startTime,
        endTime,
      }
    });
    
    res.json({ imported, skipped, startTime, endTime });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Import failed' });
  }
});

app.post('/api/import/wechat', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    const dataStartIndex = 16;
    let imported = 0;
    let skipped = 0;
    const times: Date[] = [];
    const newRecordIds: string[] = [];
    
    for (let i = dataStartIndex; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 10) continue;
      
      const [
        transactionTime, transactionType, counterparty, product,
        incomeExpense, amountStr, paymentMethod, currentStatus,
        transactionOrderNo, merchantOrderNo, remark, myCategory, remarkDescription
      ] = row;
      
      const cleanOrderNo = String(transactionOrderNo || '').trim();
      if (!cleanOrderNo) continue;
      
      const amountClean = String(amountStr || '0').replace(/[¥,]/g, '');
      const amount = parseFloat(amountClean) || 0;
      const parsedTime = parseWechatTime(transactionTime);
      if (!parsedTime) continue;
      
      const existing = await prisma.wechatTransaction.findUnique({
        where: { transactionOrderNo: cleanOrderNo }
      });
      
      if (existing) {
        skipped++;
        continue;
      }
      
      try {
        const record = await prisma.wechatTransaction.create({
          data: {
            transactionTime: parsedTime,
            transactionType: String(transactionType || '').trim(),
            counterparty: String(counterparty || '').trim(),
            product: product ? String(product).trim() : null,
            incomeExpense: String(incomeExpense || '').trim(),
            amount: new Prisma.Decimal(amount),
            paymentMethod: paymentMethod ? String(paymentMethod).trim() : null,
            currentStatus: String(currentStatus || '').trim(),
            transactionOrderNo: cleanOrderNo,
            merchantOrderNo: merchantOrderNo ? String(merchantOrderNo).trim() : null,
            remark: remark ? String(remark).trim() : null,
            myCategory: myCategory ? String(myCategory).trim() : null,
            remarkDescription: remarkDescription ? String(remarkDescription).trim() : null,
          },
        });
        
        const { id: unifiedId } = await syncRecordToUnified('wechat', record);
        newRecordIds.push(unifiedId);
        times.push(parsedTime);
        imported++;
      } catch (error) {
        skipped++;
      }
    }
    
    for (const unifiedId of newRecordIds) {
      await autoClassifyRecord(unifiedId);
    }
    
    const timestamp = Date.now();
    const savedFileName = `${timestamp}_${originalName}`;
    const savedPath = path.join(UPLOADS_DIR, savedFileName);
    fs.renameSync(req.file.path, savedPath);
    
    const startTime = times.length > 0 ? new Date(Math.min(...times.map(t => t.getTime()))) : new Date();
    const endTime = times.length > 0 ? new Date(Math.max(...times.map(t => t.getTime()))) : new Date();
    
    await prisma.importRecord.create({
      data: {
        fileName: originalName,
        source: 'wechat',
        filePath: savedFileName,
        importedCount: imported,
        skippedCount: skipped,
        startTime,
        endTime,
      }
    });
    
    res.json({ imported, skipped, startTime, endTime });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: 'Import failed' });
  }
});

app.get('/api/import/records', async (_req: Request, res: Response) => {
  const records = await prisma.importRecord.findMany({
    orderBy: { createdAt: 'desc' }
  });
  res.json(records);
});

app.post('/api/import/open/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const record = await prisma.importRecord.findUnique({
    where: { id }
  });
  
  if (!record) {
    return res.status(404).json({ error: 'Record not found' });
  }
  
  const filePath = path.join(UPLOADS_DIR, record.filePath);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  exec(`open "${filePath}"`, (error) => {
    if (error) {
      return res.status(500).json({ error: 'Failed to open file' });
    }
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
});
