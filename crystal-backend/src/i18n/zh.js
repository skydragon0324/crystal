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

  scene: {
    aLayerNeedsAPicture: '场景的 {layer} 图层需要一张图片',
    aPictureMustBeAnUpload: '{layer} 图层必须指向已上传的文件，而不是其他地址',
    thatIsNotAScene: '场景必须是包含图层列表的对象',
    tooManyLayers: '一个场景最多只能有 {limit} 个图层',
    unknownAnimation: '没有名为 {name} 的动画'
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
  },

  crm: {
    aCustomerCannotBeRelatedToThemselves: '客户不能与自己建立关系',
    chooseAChannelThatCarriesMessages: '请选择邮件、短信、App 推送或会员收件箱',
    chooseAFile: '请选择文件',
    similarCustomersExist: '已有与此人相似的客户',
    thatUserIdIsTaken: '用户 ID {party_id} 已属于另一位客户',
    checkTheDetails: '部分信息无效',
    thisIsNotAnExcelFile: '这不是 Excel (.xlsx) 文件',
    theFileHasNoSheet: '文件中没有可读取的工作表',
    requiredColumnsAreMissing: '工作表缺少必填列',
    theFileHasNoRows: '表头下方没有数据行',
    tooManyRows: '一个工作表最多可包含 {max} 人',
    fixTheRowsAndUploadAgain: '部分行有错误,请修正后重新上传',
    chooseARelationship: '请选择关系',
    chooseAStaffMember: '请选择员工',
    chooseATag: '请选择标签',
    chooseATeamRole: '请选择客户团队中的角色',
    chooseAnAgreementType: '请选择合同类型',
    chooseHowItEnded: '请选择处理结果',
    chooseTheRelatedCustomer: '请选择关联客户',
    chooseWhatItWasAbout: '请选择沟通类型',
    chooseWhatTheMessageIsFor: '请选择消息用途',
    giveASummary: '请填写摘要',
    itCannotEndBeforeItStarts: '结束日期不能早于开始日期',
    messageQueued: '消息已加入发送队列',
    thatCaseIsAnotherCustomers: '该服务工单属于其他客户',
    thatKindOfFileIsNotAccepted: '不支持该文件类型，请上传 PDF 或图片',
    thatProjectDoesNotSendThat: '该项目不支持在此渠道发送此类消息',
    thatRelationshipHasEnded: '该关系已结束',
    thatRelationshipIsNotForThem: '“{relationship}”不适用于这两位客户',
    thatWouldMakeACircle: '这会使公司成为自己的上级公司',
    theCustomerHasNoContactForThatChannel: '该客户在此渠道没有可用的联系方式',
    theCustomerSaidNoToThat: '客户已拒绝或撤回此项同意',
    theyAlreadyHaveThatRole: '该员工已担任此客户的这一角色',
    theyAreAlreadyRelatedThatWay: '他们之间已存在此关系',
    thereIsNoConsentForThat: '此项没有有效的同意记录，客户需先选择同意',
    typeAndStartAreRequired: '请填写类型和开始日期',
    writeTheMessage: '请填写主题和内容',
    writeTheNote: '请填写备注内容',
    alreadyOnThatTier: '该会员已处于此等级',
    analysisFinished: '分析完成',
    onlyForOrganizations: '只有组织可以设置此项',
    onlyForPeople: '只能添加个人',
    thatRoleIsForAnotherDepartment: '该管理员的角色属于其他部门',
    thatTierBelongsToAnotherProject: '该等级属于其他项目',
    aValueIsTooLong: '{column} 的内容超出长度限制',
    aCapabilityIsRequired: '请填写能力代码',
    aReasonIsRequired: '请填写原因',
    aRequestIsAlreadyOpen: '该产品已有同类申请正在处理',
    aSerialOrImeiIsRequired: '请填写序列号或 IMEI',
    addTargetsBeforeFreezing: '冻结前请至少添加一个目标',
    alreadyATarget: '该客户已是本活动的目标',
    alreadyDecided: '该匹配已处理',
    alreadyReversed: '该活动记录已撤销',
    alreadyRevoked: '该目标已撤销',
    alreadyUnlinked: '该账号已解除关联',
    anAddressIsRequired: '请填写收货地址',
    anotherManagerMustApprove: '须由其他管理员审批您创建的内容',
    approveTheCampaignFirst: '请先审批营销活动再准备执行动作',
    audienceAndPurposeAreRequired: '请选择受众和沟通目的',
    awardsNeedAnOpenProgram: '仅在活动进行中或已结束时可发放奖励',
    cannotMoveFromTo: '无法从 {from} 变更为 {to}',
    chooseACampaignType: '请选择营销活动类型',
    chooseAChannel: '请选择渠道',
    chooseACostType: '请选择费用类型',
    chooseACustomer: '请选择客户',
    chooseAProduct: '请选择产品',
    chooseAProgram: '请选择活动',
    chooseAProgramType: '请选择活动类型',
    chooseAProject: '请选择项目',
    chooseASegment: '请选择客户分群',
    chooseASiteKind: '请选择网点类型',
    chooseAnActiveCustomer: '请选择有效客户',
    chooseAnAudienceType: '请选择受众来源',
    chooseAnEndReason: '请选择结束原因',
    chooseAnEventType: '请选择活动类型',
    chooseAnotherPartyToMerge: '请选择另一个要合并的客户',
    chooseAtLeastOneCustomer: '请至少选择一位客户',
    chooseTheNewDevice: '请选择许可证要转移到的设备',
    chooseWhatShouldHappen: '请选择要对产品执行的操作',
    chooseWhereItIsCollected: '请选择领取网点',
    chooseWhoMayTakePart: '请选择参与资格依据',
    chooseWhoReceivesIt: '请选择接收人',
    codeAndNameAreRequired: '请填写代码和名称',
    codeNameAndKindAreRequired: '请填写代码、名称和类型',
    codeNameAndTypeAreRequired: '请填写代码、名称和类型',
    contactValueIsRequired: '请填写联系方式',
    customerAndCaseTypeAreRequired: '请选择客户和工单类型',
    customerAndPointTypeAreRequired: '请选择客户和积分类型',
    evaluated: '客户分群已重新计算',
    giveTheWalletReference: '请填写钱包交易单号',
    importFinished: '导入完成',
    merged: '客户已合并',
    nameTheAudience: '请填写受众名称',
    noEntriesLeft: '该客户的参与次数已用完',
    noNumbersLeft: '该号段已用完',
    nobodyHoldsItThatWay: '当前没有人以该关系持有此产品',
    notAConsentStatus: '无效的授权状态',
    notAStatusYouCanSet: '此处不能设置该状态',
    notEnoughPoints: '积分不足：余额 {balance}，需要 {needed}',
    notWhileTheProgramIs: '活动处于 {status} 状态时不能执行此操作',
    nothingToMerge: '没有可合并的记录',
    onlyADraftActionCanChange: '只能修改草稿状态的执行动作',
    onlyALicenceCanBeRebound: '只有许可证可以转移到其他设备',
    onlyPartiesOfOneType: '个人只能与个人合并，组织只能与组织合并',
    onlyWalletCreditsAreCredited: '只有钱包奖励可以标记为已入账',
    pointTypeIsInactive: '该积分类型已停用',
    pointsMustNotBeZero: '积分不能为零',
    prepared: '已生成发送名单',
    projectAndAccountAreRequired: '请选择项目并填写账号',
    projectCodeAndStatusAreRequired: '请选择项目、源状态码和状态',
    recalculated: '统计已重新计算',
    reservationsAreStillOpen: '仍有 {n} 个预约未完成',
    siteAndActivityAreRequired: '请选择网点和活动类型',
    someoneElseHoldsThisProduct: '该产品已被他人持有',
    targetsAreFrozen: '目标名单已冻结',
    targetsBuilt: '已添加目标',
    thatAccountIsAlreadyLinked: '该账号已关联到某位客户',
    thatCodeIsTaken: '该代码已被使用',
    thatOptionAlreadyExists: '该项目、目的和渠道组合已存在',
    thatQuotaAlreadyExists: '该配额已存在',
    thatSerialBelongsToAnotherProduct: '该序列号属于其他产品',
    thatSerialIsAlreadyKnown: '该项目中已存在此序列号',
    thatSiteIsAlreadyInTheProgram: '该网点已以此角色参与活动',
    thatSiteIsNotInThisProgram: '该网点未参与本活动',
    thatTargetAlreadyExists: '该网点、活动和周期的目标已存在',
    theProgramHasEnded: '活动已结束',
    theProgramHasNotStarted: '活动尚未开始',
    theProgramIsNotOpen: '活动未开放',
    theQuotaIsFull: '配额已满',
    theRuleIsEmpty: '规则为空',
    theRuleIsNotValidJson: '规则不是有效的 JSON',
    theRuleIsTooDeep: '规则嵌套层级过多',
    theRuleNeedsAProductClass: '规则需要指定产品分类',
    theRuleNeedsAValue: '条件“{field}”缺少 {value} 的取值',
    theRuleNeedsAnActivity: '规则需要指定活动类型',
    theSiteAlreadyHasThat: '该网点已具备此能力',
    thisActionIsAlreadyPrepared: '该执行动作已生成名单',
    thisBasisHasNothingToBuild: '该资格依据无法自动生成名单，请手动添加目标',
    thisCampaignIsFinished: '该营销活动已结束',
    thisCaseFollowsARepairTicket: '该工单来自 Crystal 维修单，请在维修单中修改',
    thisCodeIsUsedByTheSystem: '代码 {code} 为系统使用，不能修改或删除',
    thisContactIsAlready: '该客户已有此联系方式',
    thisCustomerAlreadyHoldsItThatWay: '该客户已以此关系持有该产品',
    thisCustomerIsNotATarget: '该客户不是本活动的目标',
    thisIdCardHasAnEntry: '该身份证已在本活动中登记',
    thisPartyWasMerged: '该客户已合并到其他客户',
    thisProductAlreadyHasAnOwner: '该产品已归属于 {holder}',
    thisProductIsOutOfService: '该产品已作废或报废',
    thisQuotaIsInUse: '该配额已被使用，不能删除',
    thisRegistrationHasEnded: '该登记已结束',
    thisRewardHasBeenAwarded: '该奖励已发放，不能删除',
    thisRewardIsAllGone: '该奖励已发完',
    thisSegmentIsArchived: '该客户分群已归档',
    thisSiteCannotDoThat: '该网点不具备 {capability} 能力',
    tiersAreFixedOnceTargetsAreFrozen: '目标冻结后等级不能再修改',
    unknownActivity: '未知的活动类型',
    unknownChannel: '未知渠道',
    unknownContactType: '未知的联系方式类型',
    unknownPointEvent: '未知的积分事件 {code}',
    unknownPointType: '未知的积分类型',
    unknownRelationship: '未知的持有关系',
    unknownRuleField: '规则不支持“{field}”',
    unknownStatus: '未知状态'
  }
};
