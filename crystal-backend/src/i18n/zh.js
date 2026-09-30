/**
 * 简体中文.
 *
 * The same addresses as en.js, in the same sections - see the note there for
 * why the key is an address rather than the English sentence.
 *
 * An address missing from this file falls back to the English rather than
 * showing the address, so a half finished catalog leaves a working system.
 * scripts/check.js still reports the gap, because "it works" and "it is
 * translated" are different claims.
 */
module.exports = {
  auth: {
    administratorSignInRequired: '请先登录管理后台',
    incorrectUsernameOrPassword: '用户名或密码错误',
    pleaseSignInTo: '请先登录',
    thisAdministratorAccountIs: '该管理员账号已停用'
  },

  blog: {
    aPostNeedsWords: '内容不能为空',
    thePostIsTooLong: '内容过长，请精简后再提交',
    alreadyGiven: '你已经点过赞了，点赞后无法更改',
    alreadySubmitted: '这篇已经提交审核，不能再保存为草稿',
    anArticleNeedsAShelf: '文章需要选择一个栏目',
    anArticleNeedsATitle: '文章需要标题',
    noSuchShelf: '该栏目不存在',
    notOnYourOwn: '不能给自己写的内容点赞',
    oneArticleADay: '今天已经发过一篇文章，明天可以再发',
    oneReplyADay: '今天已经回复过一次，明天可以再回复',
    thatIsNotAThumb: '点赞只能是金、银或铜',
    threadIsNotOpen: '该主题暂不接受回复'
  },

  agencies: {
    aPhoneNumberIsTooLong: '电话号码最多 40 个字符：{phone}',
    aPhoneLabelIsTooLong: '电话号码的标签最多 60 个字符：{label}',
    phonesMustBeAList: '电话号码必须以号码列表的形式提交',
    thereIsNoProvinceCalled: '没有名为“{province}”的省份，请先在“省份”页面添加'
  },

  claims: {
    aClaimForAlready: '该服务中心 {month} 的理赔单已存在',
    aRejectedClaimNeeds: '驳回理赔单必须填写原因',
    thereAreNoCovered: '{month} 没有可理赔的保内维修',
    thisClaimHasAlready: '该理赔单已支付'
  },

  common: {
    isNotAValue: '“{value}” 不是 {type} 可接受的值',
    isRequired: '{column} 为必填项',
    aRequiredValueIs: '缺少必填项',
    aServiceCentreIs: '请选择服务中心',
    created: '创建成功',
    deleted: '删除成功',
    duplicatedValue: '该值已存在',
    internalServerError: '服务器内部错误',
    invalidToken: '无效的登录凭证',
    moveItToThe: '请先将该记录移入回收站',
    notFound: '记录不存在',
    nothingToUpdate: '没有需要更新的内容',
    ok: '成功',
    otherRecordsStillRefer: '仍有其他记录引用该条目',
    partNotFound: '配件不存在',
    permissionDenied: '没有操作权限',
    referencedRecordIsMissing: '关联记录不存在或仍在使用中',
    restored: '恢复成功',
    sent: '发送成功',
    signedIn: '登录成功',
    signedOut: '退出成功',
    theDeviceSerialNumber: '请填写设备序列号',
    theNewPasswordMust: '新密码至少需要 {n} 个字符',
    theOldPasswordIs: '原密码不正确',
    thisAccountIs: '该账户状态为 {status}',
    thisSerialNumberIs: '该序列号已被注册',
    ticketNotFound: '维修单不存在',
    updated: '更新成功',
    valueFailedAValidation: '数据未通过校验规则'
  },

  crud: {
    thisResourceIsNot: '该资源不支持恢复'
  },

  error: {
    endpointNotFound: '接口不存在：{method} {url}'
  },

  excel: {
    nothingToWriteOn: '该行没有可写入的内容',
    imported: '已导入',
    noSpreadsheetWasUploaded: '未上传表格文件',
    noneOfTheColumns: '该表格中没有可识别的列',
    thatFileIsNot: '无法读取该表格文件',
    thatSpreadsheetHasNo: '该表格没有任何数据行',
    thatSpreadsheetIsMissing: '该表格缺少必填列：{columns}',
    theSpreadsheetCouldNot: '表格导入失败',
    thisResourceCannotBe: '该资源不支持导入'
  },

  memberAuth: {
    certificateAgentTooOld: '本机的证书程序版本过旧，请安装最新版本',
    certificateNotAccepted: '证书未通过验证',
    certificateSignInIsNotEnabled: '本站未启用证书登录',
    aPasswordOfAt: '密码至少需要 8 个字符',
    aUserIdOf: '用户 ID 需为 4-40 位字母、数字、点、短横线或下划线',
    passwordSignInIs: '此设备不支持密码登录',
    pleaseWaitSecondsBefore: '请等待 {n} 秒后再获取验证码',
    thatCodeHasExpired: '验证码已过期，请重新获取',
    thatVerificationCodeIs: '验证码不正确',
    thoseSignInDetails: '登录信息与任何账户都不匹配',
    tooManyAttemptsOn: '尝试次数过多，请重新获取验证码',
    verificationCodeSignIn: '验证码登录仅适用于移动设备'
  },

  feedback: {
    threadIsResolved: '该反馈已解决，请另外提交新的反馈',
    threadIsFinished: '该反馈未获答复即已关闭，请另外提交新的反馈'
  },

  eproduct: {
    theServiceAddressIs: '本部署未配置电子产品服务地址',
    aFaultHasAlready: '该许可证的故障已上报，正在处理中',
    theServiceHasNot: '电子产品服务尚未为该次发码签发许可证',
    theLicenceFileDidNot: '电子产品服务没有返回许可证文件，请稍后再试'
  },

  oldLogs: {
    balanceCarriedOver: '结转余额'
  },

  permission: {
    pageNotRegisteredIn: '页面未在 manager_pages 中登记：{page}'
  },

  repairTickets: {
    aTicketCannotBe: '未结清费用前不能结单',
    aTicketCannotBeClosed: '仍有配件未出库，不能结单',
    aTicketCannotMove: '维修单不能从「{from}」变更为「{to}」',
    technicianWorksAtAnother: '技师 {name} 不属于该服务中心',
    theCustomerNameAnd: '请填写客户姓名和电话',
    thisTicketIsAlready: '该维修单已结单',
    thisTicketIsCancelled: '该维修单已取消'
  },

  replenishments: {
    aReplenishmentNeedsAt: '补货单至少需要一条明细',
    thisReplenishmentHasAlready: '该补货单已收货'
  },

  signing: {
    itemNoLongerMatches: '此条目与其签名不再一致——它在控制台之外被修改过，因此未保存任何内容。请先运行签名审计并核查'
  },

  stock: {
    aMovementNeedsA: '出入库数量不能为零',
    onlyOfAreAvailable: '该服务中心 {part} 可用库存仅 {n} 件',
    thisPartIsNot: '该服务中心未设置此配件的库存'
  },

  storefront: {
    chooseAtLeastProducts: '请至少选择 {n} 件商品进行对比'
  },

  token: {
    tokenExpired: '登录已过期'
  },

  upload: {
    contentDoesNotMatchType: '文件内容并非 {declared}——文件必须与其声明的类型一致',
    onlyDocumentsAreAllowed: '此处仅允许上传文档（{types}）',
    onlyImagesAreAllowed: '此处仅允许上传图片（{types}）',
    onlyXlsxSpreadsheetsCan: '仅支持导入 .xlsx 表格',
    unknownUploadFolder: '未知的上传目录：{folder}'
  },

  wallet: {
    anAdjustmentNeedsA: '调整余额必须填写原因',
    notEnoughBalance: '余额不足',
    notEnoughPoints: '积分不足'
  },

  warranties: {
    warrantyRanFromTo: '保修记录 {id} 的有效期为 {from} 至 {to}，而设备于 {arrived} 送修',
    warrantyHasBeenVoided: '保修记录 {id} 已作废',
    warrantyCoversDeviceNot: '保修记录 {id} 对应设备 {covers}，而非 {given}',
    warrantyDoesNotExist: '保修记录 {id} 不存在',
    aCoveredRepairMust: '保修维修必须指明所依据的保修记录',
    theWarrantyHasAlready: '该保修已使用 {n} 次理赔额度',
    thisWarrantyHasBeen: '该保修已作废',
    warrantyNotFound: '保修记录不存在'
  },

  member: {
    youHaveAlreadyRegistered: '您已注册过该设备'
  },

  conflict: {
    thatTechnicianAlreadyHas: '该技师已具备此技能',
    thatPartAlreadyHasA: '该服务中心已有此配件的库存记录',
    thatPartIsAlreadyOn: '该补货单已包含此配件',
    thatSpecificationIsAlready: '该产品已设置此规格参数',
    thatFinishIsAlready: '该产品已登记此配色',
    thatRoleAlreadyHasA: '该角色已设置此页面的权限',
    thatPartIsAlready: '该产品已登记此配件',
    aClaimForThatMonth: '该服务中心当月的理赔单已存在',
    thatServiceIsAlready: '该服务中心已登记此服务项目'
  }
};
