/**
 * 简体中文 — the About page's copy, in Chinese.
 *
 * WHY THIS IS A FILE AND NOT DICTIONARY ENTRIES.
 *
 * The catalogue in i18n/dictionaries.js is for interface strings: a button, a
 * column heading, an empty state. This is prose, written to be read as
 * paragraphs. Chopped into dotted keys it would be unreviewable in either
 * language.
 *
 * So it mirrors content.js exactly: the same section codes, the same item
 * order, the same field names. buildAbout() merges the two, which means:
 *
 *   A MISSING STRING FALLS BACK TO THE ENGLISH rather than disappearing or
 *   rendering as a key. A half-finished translation leaves a working page.
 *
 *   ONLY TRANSLATABLE FIELDS APPEAR HERE. `slot`, `icon`, `floor` and `year`
 *   are addresses, not language, and they are read from content.js alone -
 *   so a picture cannot be lost by translating around it.
 *
 *   LINE BREAKS, <strong> AND <big> CARRY OVER. A description here is
 *   rendered the same way as the English one, so it may use all three.
 *
 * aboutContent.test.js asserts every English string has a counterpart here,
 * which is the only way this stays complete as the English changes.
 */

export const SECTIONS = {
  OVERVIEW: {
    eyebrow: '关于晶石',
    title: '技术。制造。商贸。',
    description: '<big>晶石</big>自主设计并制造所销售的电子产品。搭载自研芯片的智能手机，运行同一操作系统的电视与机顶盒，以及支撑这一切的工厂、研究院与服务网络。\n\n十一年前，我们为其他公司组装机顶盒。我们保留了工厂，学会了自己写软件，并且不再把别人的名字印在盒子上。'
  },

  VISION: {
    eyebrow: '我们的愿景',
    title: '让技术改善日常生活。',
    description: '一台设备值得拥有的前提，是它用着安全、修着便宜。我们做的每一件产品都以此为尺度——这也是为什么一部 179 美元的手机，能和它之上的旗舰获得同样五年的系统更新。'
  },

  BUSINESSES: {
    eyebrow: '我们做什么',
    title: '五项业务，一家公司。',
    subtitle: '从手机里的芯片，到它上架的货架。'
  },

  RECOGNITION: {
    eyebrow: '行业认可',
    title: '入选 IT 企业十强。',
    subtitle: '对我们所造之物、以及制造方式的独立评估。'
  },

  HISTORY: {
    eyebrow: '我们的历程',
    title: '晶石的十一年。',
    subtitle: '从一条代工装配线，到一家设计自己产品的公司。'
  },

  INSTITUTE: {
    eyebrow: '研究',
    title: '晶石 IT 研究院',
    subtitle: '研究。创造。变革。',
    description: '<strong>四百名工程师</strong>，分布于上海与杭州。研究院拥有<strong>晶石 OS</strong>、影像管线、Halo 与 Nova 平台，以及连接电视与手机的互联设备技术栈。\n\n这比直接购买公版方案要慢，但也正因如此，同一套相机在 C5 上的表现才与 C9 一致。'
  },

  TECHNOLOGY: {
    eyebrow: '自有技术',
    title: '自主研发，独立认证。',
    subtitle: '晶石自行研发的平台与防护技术。'
  },

  FACTORY: {
    eyebrow: '我们在哪里制造',
    title: '电子产品工厂',
    subtitle: '品质融入每一件产品。',
    description: '苏州城外四万平方米，也是这家公司最早的部分。贴片、组装、功能测试与包装都在同一屋檐下完成——所以测试中发现的问题，当天下午就能追回到造成它的那条产线。'
  },

  MANUFACTURING: {
    eyebrow: '我们如何制造',
    title: '从元器件到封箱，六道工序。',
    subtitle: '每一道都有度量，出现问题即退回造成它的那一道。'
  },

  SHOP: {
    eyebrow: '在哪里找到我们',
    title: '晶石门店',
    subtitle: '亲身体验晶石。',
    description: '南京东路上的三层空间：产品线、客厅，以及修理你已拥有之物的柜台。'
  },

  SERVICE: {
    eyebrow: '售后',
    title: '售后服务',
    subtitle: '购买之后的支持。'
  },

  PRESENCE: {
    eyebrow: '我们在哪里',
    title: '晶石布局',
    subtitle: '以技术连接人。'
  }
};

export const ITEMS = {
  FACT: [
    { title: '晶石公司' },
    { title: '晶石股份有限公司' },
    { title: '晶石集团' }
  ],

  BUSINESS: [
    { title: '智能手机' },
    { title: '电子产品' },
    { title: '软件' },
    { title: '印刷' },
    { title: '商贸' }
  ],

  HISTORY_EVENT: [
    { description: '晶石成立。\n苏州城外十六个人，为其他公司组装机顶盒。' },
    { description: '工厂规模翻倍。\n第二条产线，以及第一套名副其实的质量体系。我们不再因返工而亏损。' },
    { description: '第一部晶石手机。\nC1 出货。它并不出众，但教会了我们如何建立供应链。' },
    { description: '晶石 OS 1.0。\n我们不再交付别人的软件，开始交付自己的。' },
    { description: 'IT 研究院成立。\n上海八十名工程师，使命是拥有平台，而非授权使用它。' },
    { description: '服务网络。\n九个省份的授权中心，共用同一份公开价目表。' },
    { description: '晶石视界。\n电视与卡拉 OK 技术栈，建立在与手机相同的操作系统之上。' },
    { description: 'IT 企业十强。\n在第一条产线启动八年之后，平台工作获得独立认可。' },
    { description: 'Halo 平台。\n自研芯片。C9 系列是第一款搭载它的产品。' },
    { description: '三层旗舰店。\n南京东路开业：产品线、客厅与维修柜台同处一栋。' },
    { description: '全系五年更新。\n包括 179 美元的 C3——它在每台设备上的成本比旗舰更高。' }
  ],

  RESEARCH_AREA: [
    { title: '软件开发', description: '晶石 OS、更新管线，以及支撑二者的服务。' },
    { title: '移动技术', description: 'Halo 与 Nova 平台上的射频、功耗与散热工作。' },
    { title: '晶石 OS', description: '横跨手机、电视与机顶盒的同一套操作系统。' },
    { title: '影像与人工智能', description: '相机管线，以及运行其中的端侧模型。' },
    { title: '物联与互联设备', description: '电视、手机与机顶盒如何在家庭网络中彼此发现。' },
    { title: '安全与更新', description: '每一款机型五年的补丁，以及交付它们的基础设施。' }
  ],

  TECHNOLOGY: [
    { title: '晶石 OS' },
    { title: 'SmartTV OS' },
    { title: '电脑 BIOS' },
    { title: '摄像头安全' },
    { title: '印刷防伪' },
    { title: 'exFAT 固件' },
    { title: '无绳电话加密' }
  ],

  MANUFACTURING_FLOW: [
    { title: '元器件', description: '来料检验；未通过的料卷不会进入任何一条产线。' },
    { title: '贴片', description: '六条贴片产线，每道工序之间都有自动光学检测。' },
    { title: '组装', description: '屏幕贴合、电池、外壳，以及决定防护等级的密封。' },
    { title: '功能测试', description: '每一路射频、每一颗传感器、每一个接口，逐台测试，而非抽样。' },
    { title: '质量保证', description: '每款机型一套抽检方案；出现失效即停线，而不是写进报告。' },
    { title: '包装', description: '自行印刷、成型与装填——所以包装盒与设备一同抵达，而不是晚三周。' }
  ],

  SHOP_FLOOR: [
    {
      title: '产品线',
      subtitle: '一层',
      description: '在售的每一款手机都已开机并登录，配套配件一并陈列。可以购买，也可以带上你的设备在此完成设置。'
    },
    {
      title: '客厅',
      subtitle: '二层',
      description: '电视、机顶盒、相机与卡拉 OK 技术栈，陈列在像房间的房间里，而不是像货架的货架上。'
    },
    {
      title: '服务柜台',
      subtitle: '三层',
      description: '一家完整的授权服务中心：维修、保修、系统安装与设备登记。可直接到店。'
    }
  ],

  SERVICE: [
    { title: '手机维修', description: '屏幕、电池、接口与主板。\n每一项价格都在你需要之前公布。' },
    { title: '电子产品维修', description: '电视、机顶盒、电脑与相机。\n在列有相应服务的中心受理。' },
    { title: '软件服务', description: '晶石 OS 的安装与恢复。\n任一授权中心均可现场等待办理。' },
    { title: '保修', description: '登记在你的账户上，而不是一张需要保管的收据上。' },
    { title: '晶石 Care+', description: '意外损坏保障。\n可在设备保修期内随时购买。' }
  ],

  LOCATION: [
    { title: '晶石总部', subtitle: '上海', description: '总部与各商贸业务。' },
    { title: '晶石门店', subtitle: '上海南京东路', description: '三层旗舰店。' }
  ]
};

export const CERTIFICATES = {
  CORPORATE: [
    { name: 'ISO 9001 质量管理', issuer: '国际标准化组织' },
    { name: 'ISO 14001 环境管理', issuer: '国际标准化组织' },
    { name: 'ISO 27001 信息安全', issuer: '国际标准化组织' },
    { name: '高新技术企业', issuer: '科学技术部' },
    { name: '国家规划布局内软件企业', issuer: '软件行业协会' },
    { name: '知识产权管理体系', issuer: '国家知识产权局' },
    { name: '海关高级认证企业', issuer: '海关总署' }
  ],

  FACTORY_QA: [
    { name: 'IATF 16949 汽车质量管理', issuer: '国际汽车工作组' },
    { name: 'IPC-A-610 二级组装', issuer: 'IPC' },
    { name: 'ISO 45001 职业健康安全', issuer: '国际标准化组织' },
    { name: 'RoHS 合规', issuer: '公告机构' },
    { name: 'REACH 合规', issuer: '公告机构' },
    { name: 'ESD S20.20 静电防护', issuer: '静电放电协会' }
  ]
};

export const GROWTH = {
  unit: { percent: '%' },

  series: [
    { label: '总体增长' },
    { label: '业务' },
    { label: '工程师' },
    { label: '收入' },
    { label: '利润' }
  ]
};

/* Named exports are what content.js imports; this is for symmetry with it. */
const zh = { SECTIONS, ITEMS, CERTIFICATES, GROWTH };

export default zh;
