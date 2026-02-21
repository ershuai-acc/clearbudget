import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

type TransactionType = 'EXPENSE' | 'INCOME' | 'OTHER';

function normalizeTransactionType(incomeExpense: string): TransactionType {
  const normalized = incomeExpense.trim();
  if (normalized === '支出') return 'EXPENSE';
  if (normalized === '收入') return 'INCOME';
  return 'OTHER';
}

async function syncAlipayToUnified() {
  console.log('📱 同步支付宝数据到统一表...');
  
  const alipayRecords = await prisma.alipayTransaction.findMany();
  let synced = 0;
  
  for (const record of alipayRecords) {
    await prisma.unifiedTransaction.upsert({
      where: {
        source_sourceId: {
          source: 'alipay',
          sourceId: record.id,
        },
      },
      update: {
        transactionTime: record.transactionTime,
        amount: record.amount,
        transactionType: normalizeTransactionType(record.incomeExpense),
        category: record.myCategory,
        description: record.productDescription,
        counterparty: record.counterparty,
      },
      create: {
        transactionTime: record.transactionTime,
        amount: record.amount,
        transactionType: normalizeTransactionType(record.incomeExpense),
        category: record.myCategory,
        description: record.productDescription,
        counterparty: record.counterparty,
        source: 'alipay',
        sourceId: record.id,
      },
    });
    synced++;
  }
  
  console.log(`✅ 支付宝同步完成: ${synced} 条`);
}

async function syncWechatToUnified() {
  console.log('💬 同步微信数据到统一表...');
  
  const wechatRecords = await prisma.wechatTransaction.findMany();
  let synced = 0;
  
  for (const record of wechatRecords) {
    const incomeExpense = record.incomeExpense === '/' ? '不计收支' : record.incomeExpense;
    
    await prisma.unifiedTransaction.upsert({
      where: {
        source_sourceId: {
          source: 'wechat',
          sourceId: record.id,
        },
      },
      update: {
        transactionTime: record.transactionTime,
        amount: record.amount,
        transactionType: normalizeTransactionType(incomeExpense),
        category: record.myCategory,
        description: record.product || record.transactionType,
        counterparty: record.counterparty,
      },
      create: {
        transactionTime: record.transactionTime,
        amount: record.amount,
        transactionType: normalizeTransactionType(incomeExpense),
        category: record.myCategory,
        description: record.product || record.transactionType,
        counterparty: record.counterparty,
        source: 'wechat',
        sourceId: record.id,
      },
    });
    synced++;
  }
  
  console.log(`✅ 微信同步完成: ${synced} 条`);
}

async function main() {
  console.log('🚀 开始数据同步...\n');
  
  try {
    await syncAlipayToUnified();
    console.log('');
    await syncWechatToUnified();
    
    const unifiedCount = await prisma.unifiedTransaction.count();
    const expenseCount = await prisma.unifiedTransaction.count({ where: { transactionType: 'EXPENSE' } });
    const incomeCount = await prisma.unifiedTransaction.count({ where: { transactionType: 'INCOME' } });
    const otherCount = await prisma.unifiedTransaction.count({ where: { transactionType: 'OTHER' } });
    
    console.log('\n📊 统一表统计:');
    console.log(`   总记录数: ${unifiedCount} 条`);
    console.log(`   支出: ${expenseCount} 条`);
    console.log(`   收入: ${incomeCount} 条`);
    console.log(`   其他: ${otherCount} 条`);
    
  } catch (error) {
    console.error('❌ 同步失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
