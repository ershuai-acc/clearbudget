import { PrismaClient, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// 文件路径配置
const DATA_DIR = path.join(__dirname, '..');
const ALIPAY_FILE = path.join(DATA_DIR, '支付宝交易明细(20260101-20260221).csv');
const WECHAT_FILE = path.join(DATA_DIR, '微信支付账单流水文件(20260101-20260221)——【解压密码可在微信支付公众号查看】.xlsx');

/**
 * 解析支付宝 CSV 文件
 */
async function importAlipayData() {
  console.log('📱 开始导入支付宝数据...');
  
  const content = fs.readFileSync(ALIPAY_FILE, 'utf-8');
  const lines = content.split('\n');
  
  // 找到数据起始行（第25行是表头，第26行开始是数据）
  const dataStartIndex = 25; // 0-based index, 对应第26行
  const headerLine = lines[24]; // 第25行是表头
  
  let imported = 0;
  let skipped = 0;
  
  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // 解析 CSV 行（考虑引号内的逗号）
    const fields = parseCSVLine(line);
    if (fields.length < 10) continue;
    
    const [
      transactionTime,      // 交易时间
      transactionCategory,  // 交易分类
      counterparty,         // 交易对方
      counterpartyAccount,  // 对方账号
      productDescription,   // 商品说明
      incomeExpense,        // 收/支
      amountStr,            // 金额
      paymentMethod,        // 收/付款方式
      transactionStatus,    // 交易状态
      transactionOrderNo,   // 交易订单号
      merchantOrderNo,      // 商家订单号
      remark,               // 备注
      myCategory,           // 我的分类
      remarkDescription     // 备注说明
    ] = fields;
    
    // 清理订单号中的制表符和引号
    const cleanOrderNo = transactionOrderNo?.replace(/[\t"]/g, '').trim();
    if (!cleanOrderNo) continue;
    
    // 解析金额
    const amount = parseFloat(amountStr) || 0;
    
    // 解析时间
    const parsedTime = parseAlipayTime(transactionTime);
    if (!parsedTime) continue;
    
    try {
      await prisma.alipayTransaction.upsert({
        where: { transactionOrderNo: cleanOrderNo },
        update: {
          transactionTime: parsedTime,
          transactionCategory: transactionCategory?.trim() || '',
          counterparty: counterparty?.trim() || '',
          counterpartyAccount: counterpartyAccount?.trim() || null,
          productDescription: productDescription?.trim() || '',
          incomeExpense: incomeExpense?.trim() || '',
          amount: new Prisma.Decimal(amount),
          paymentMethod: paymentMethod?.trim() || null,
          transactionStatus: transactionStatus?.trim() || '',
          merchantOrderNo: merchantOrderNo?.replace(/[\t"]/g, '').trim() || null,
          remark: remark?.trim() || null,
          myCategory: myCategory?.trim() || null,
          remarkDescription: remarkDescription?.trim() || null,
        },
        create: {
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
      imported++;
    } catch (error) {
      console.error(`跳过行 ${i + 1}: ${(error as Error).message}`);
      skipped++;
    }
  }
  
  console.log(`✅ 支付宝数据导入完成: ${imported} 条成功, ${skipped} 条跳过`);
}

/**
 * 解析微信 XLSX 文件
 */
async function importWechatData() {
  console.log('💬 开始导入微信数据...');
  
  const workbook = XLSX.readFile(WECHAT_FILE);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  
  // 数据从第17行开始（index 16）
  const dataStartIndex = 16;
  
  let imported = 0;
  let skipped = 0;
  
  for (let i = dataStartIndex; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 10) continue;
    
    const [
      transactionTime,    // 交易时间
      transactionType,    // 交易类型
      counterparty,       // 交易对方
      product,            // 商品
      incomeExpense,      // 收/支
      amountStr,          // 金额(元)
      paymentMethod,      // 支付方式
      currentStatus,      // 当前状态
      transactionOrderNo, // 交易单号
      merchantOrderNo,    // 商户单号
      remark,             // 备注
      myCategory,         // 我的分类
      remarkDescription   // 备注说明
    ] = row;
    
    // 清理订单号
    const cleanOrderNo = String(transactionOrderNo || '').trim();
    if (!cleanOrderNo) continue;
    
    // 解析金额（去掉¥符号）
    const amountClean = String(amountStr || '0').replace(/[¥,]/g, '');
    const amount = parseFloat(amountClean) || 0;
    
    // 解析时间
    const parsedTime = parseWechatTime(transactionTime);
    if (!parsedTime) continue;
    
    try {
      await prisma.wechatTransaction.upsert({
        where: { transactionOrderNo: cleanOrderNo },
        update: {
          transactionTime: parsedTime,
          transactionType: String(transactionType || '').trim(),
          counterparty: String(counterparty || '').trim(),
          product: product ? String(product).trim() : null,
          incomeExpense: String(incomeExpense || '').trim(),
          amount: new Prisma.Decimal(amount),
          paymentMethod: paymentMethod ? String(paymentMethod).trim() : null,
          currentStatus: String(currentStatus || '').trim(),
          merchantOrderNo: merchantOrderNo ? String(merchantOrderNo).trim() : null,
          remark: remark ? String(remark).trim() : null,
          myCategory: myCategory ? String(myCategory).trim() : null,
          remarkDescription: remarkDescription ? String(remarkDescription).trim() : null,
        },
        create: {
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
      imported++;
    } catch (error) {
      console.error(`跳过行 ${i + 1}: ${(error as Error).message}`);
      skipped++;
    }
  }
  
  console.log(`✅ 微信数据导入完成: ${imported} 条成功, ${skipped} 条跳过`);
}

/**
 * 解析 CSV 行（处理引号内的逗号）
 */
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

/**
 * 解析支付宝时间格式: 2026/2/21 3:07
 */
function parseAlipayTime(timeStr: string): Date | null {
  if (!timeStr) return null;
  
  try {
    // 格式: 2026/2/21 3:07
    const [datePart, timePart] = timeStr.split(' ');
    const [year, month, day] = datePart.split('/').map(Number);
    const [hour, minute] = (timePart || '0:0').split(':').map(Number);
    
    return new Date(year, month - 1, day, hour, minute);
  } catch {
    return null;
  }
}

/**
 * 解析微信时间格式: 2026-02-20 19:53:15
 */
function parseWechatTime(timeStr: any): Date | null {
  if (!timeStr) return null;
  
  try {
    // 如果是 Excel 序列号，转换为日期
    if (typeof timeStr === 'number') {
      return new Date((timeStr - 25569) * 86400 * 1000);
    }
    
    // 字符串格式: 2026-02-20 19:53:15
    return new Date(String(timeStr));
  } catch {
    return null;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始数据导入...\n');
  
  try {
    await importAlipayData();
    console.log('');
    await importWechatData();
    
    // 统计结果
    const alipayCount = await prisma.alipayTransaction.count();
    const wechatCount = await prisma.wechatTransaction.count();
    
    console.log('\n📊 数据库统计:');
    console.log(`   支付宝交易记录: ${alipayCount} 条`);
    console.log(`   微信交易记录: ${wechatCount} 条`);
    console.log(`   总计: ${alipayCount + wechatCount} 条`);
    
  } catch (error) {
    console.error('❌ 导入失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
