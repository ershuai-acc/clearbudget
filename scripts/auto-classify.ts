import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
  
  // 转账类优先判断（余额宝收益、信用卡还款、花呗还款、基金交易）
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

async function main() {
  console.log('🤖 开始 AI 自动分类...\n');
  
  const uncategorized = await prisma.unifiedTransaction.findMany({
    where: {
      OR: [
        { category: null },
        { category: '' }
      ]
    }
  });
  
  console.log(`📋 发现 ${uncategorized.length} 条未分类记录\n`);
  
  let classified = 0;
  let skipped = 0;
  const results: Record<string, number> = {};
  
  for (const record of uncategorized) {
    const category = classifyTransaction(record.counterparty, record.description);
    
    if (category) {
      await prisma.unifiedTransaction.update({
        where: { id: record.id },
        data: {
          category,
          reviewStatus: 'pending'
        }
      });
      
      results[category] = (results[category] || 0) + 1;
      classified++;
    } else {
      skipped++;
    }
  }
  
  console.log('✅ 分类完成!\n');
  console.log('📊 分类统计:');
  for (const [cat, count] of Object.entries(results).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${cat}: ${count} 条`);
  }
  console.log(`\n   已分类: ${classified} 条`);
  console.log(`   无法判断: ${skipped} 条（需人工分类）`);
  
  const pendingCount = await prisma.unifiedTransaction.count({
    where: { reviewStatus: 'pending' }
  });
  console.log(`\n⏳ 待审查记录: ${pendingCount} 条`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
