# ClearBudget - 个人预算流水管理

一个本地运行的个人财务管理工具，用于导入、分类和分析微信/支付宝账单数据。分析流水和管理预算

## ✨ 功能特点

- 📥 **账单导入**：支持微信和支付宝账单文件导入
- 📊 **统一视图**：合并不同来源的交易记录到统一表格
- 🏷️ **智能分类**：支持手动分类和AI自动分类管理
- 📈 **数据分析**：按月份查看消费分布、TOP10 大额支出
- 💰 **预算管理**：设置各分类预算，对比实际支出

## 🚀 快速开始

### 前置要求

- Node.js 18+
- npm 或 pnpm

### 安装

```bash
# 克隆项目
git clone https://github.com/ershuai-acc/clearbudget.git
cd clearbudget

# 安装依赖
npm install

# 初始化数据库
npx prisma generate
npx prisma db push
```

### 运行

```bash
# 启动服务器
npx ts-node --transpile-only scripts/server.ts

# 访问 http://localhost:3000
```

## 📁 项目结构

```
clearbudget/
├── prisma/
│   ├── schema.prisma    # 数据库模型定义
│   └── dev.db           # SQLite 数据库（自动生成）
├── scripts/
│   ├── server.ts        # Express 后端服务器
│   └── auto-classify.ts # 自动分类脚本
├── web/
│   └── index.html       # 前端单页应用
├── uploads/             # 导入的账单备份目录
└── CATEGORY_GUIDE.md    # 分类规则指南
```

## 📱 如何导出账单

### 微信
1. 微信 → 我 → 服务 → 钱包 → 账单
2. 点击右上角"常见问题" → 下载账单
3. 选择用于个人对账，下载 xlsx 文件

### 支付宝
1. 支付宝 → 我的 → 账单
2. 点击右上角"..." → 开具交易流水证明
3. 选择时间范围，申请 csv 格式下载

## 🎯 使用流程

1. **导入账单**：在"导入"页面上传微信/支付宝账单文件
2. **审核分类**：在"汇总/类目审核"页面检查和修改交易分类
3. **查看分析**：在"预算管理/分析"页面查看消费统计和图表
4. **管理预算**：设置各分类的月度预算，跟踪实际支出

## 🔧 分类管理

- 在分类筛选下拉菜单中，悬停可看到编辑按钮 ✏️
- 点击可批量重命名分类
- 分类输入框支持自动补全已有分类
- AI分类会根据汇总表的明细和交易对象。
- AI分类提示词引用知识库文档CATEGORY_GUIDE.md，可以自行编辑修改。

## 📊 数据说明

所有数据存储在本地 SQLite 数据库中，包括：
- `alipay_transactions` - 支付宝原始数据
- `wechat_transactions` - 微信原始数据
- `unified_transactions` - 统一分析表
- `budget_template` - 预算模板
- `import_records` - 导入历史记录

## 🔒 隐私说明

- 所有数据仅存储在本地，不会上传到任何服务器
- 数据库文件和账单文件已在 `.gitignore` 中排除

## 📝 License

MIT
