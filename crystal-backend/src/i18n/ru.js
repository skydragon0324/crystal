/**
 * Русский.
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
    administratorSignInRequired: 'требуется вход администратора',
    incorrectUsernameOrPassword: 'неверное имя пользователя или пароль',
    pleaseSignInTo: 'пожалуйста, войдите, чтобы продолжить',
    thisAdministratorAccountIs: 'эта учётная запись администратора отключена'
  },

  blog: {
    aPostNeedsWords: 'запись не может быть пустой',
    thePostIsTooLong: 'запись слишком длинная — сократите её',
    alreadyGiven: 'вы уже оценили эту запись, и оценку нельзя изменить',
    alreadySubmitted: 'эта запись уже отправлена на проверку и не может снова стать черновиком',
    anArticleNeedsAShelf: 'для статьи нужно выбрать раздел',
    anArticleNeedsATitle: 'у статьи должен быть заголовок',
    noSuchShelf: 'такого раздела в этом блоге нет',
    notOnYourOwn: 'нельзя оценить собственную запись',
    oneArticleADay: 'сегодня вы уже опубликовали статью - следующую можно завтра',
    oneReplyADay: 'сегодня вы уже отвечали - следующий ответ можно завтра',
    thatIsNotAThumb: 'оценка может быть только золотой, серебряной или бронзовой',
    threadIsNotOpen: 'эта тема закрыта для ответов'
  },

  agencies: {
    aPhoneNumberIsTooLong: 'номер телефона может содержать не более 40 символов: {phone}',
    aPhoneLabelIsTooLong: 'подпись к номеру может содержать не более 60 символов: {label}',
    phonesMustBeAList: 'номера телефонов нужно передавать списком',
    thereIsNoProvinceCalled: 'провинции «{province}» нет - сначала добавьте её на экране «Провинции»'
  },

  claims: {
    aClaimForAlready: 'заявка за {month} для этого сервисного центра уже существует',
    aRejectedClaimNeeds: 'для отклонения заявки нужна причина',
    thereAreNoCovered: 'нет гарантийных ремонтов для заявки за {month}',
    thisClaimHasAlready: 'эта заявка уже оплачена'
  },

  common: {
    isNotAValue: '«{value}» — недопустимое значение для {type}',
    isRequired: '{column} — обязательное поле',
    aRequiredValueIs: 'не заполнено обязательное поле',
    aServiceCentreIs: 'нужно указать сервисный центр',
    created: 'создано',
    deleted: 'удалено',
    duplicatedValue: 'такое значение уже существует',
    internalServerError: 'внутренняя ошибка сервера',
    invalidToken: 'недействительный токен',
    moveItToThe: 'сначала переместите в корзину',
    notFound: 'запись не найдена',
    nothingToUpdate: 'нечего обновлять',
    ok: 'готово',
    otherRecordsStillRefer: 'на эту запись ещё ссылаются другие',
    partNotFound: 'деталь не найдена',
    permissionDenied: 'недостаточно прав',
    referencedRecordIsMissing: 'связанная запись отсутствует или ещё используется',
    restored: 'восстановлено',
    sent: 'отправлено',
    signedIn: 'вход выполнен',
    signedOut: 'выход выполнен',
    theDeviceSerialNumber: 'нужно указать серийный номер устройства',
    theNewPasswordMust: 'новый пароль должен быть не короче {n} символов',
    theOldPasswordIs: 'текущий пароль неверен',
    thisAccountIs: 'состояние этой учётной записи: {status}',
    thisSerialNumberIs: 'этот серийный номер уже зарегистрирован',
    ticketNotFound: 'заявка не найдена',
    updated: 'обновлено',
    valueFailedAValidation: 'значение не прошло проверку'
  },

  crud: {
    thisResourceIsNot: 'этот ресурс не использует корзину'
  },

  error: {
    endpointNotFound: 'адрес не найден: {method} {url}'
  },

  excel: {
    nothingToWriteOn: 'в этой строке нечего записывать',
    imported: 'загружено',
    noSpreadsheetWasUploaded: 'файл таблицы не загружен',
    noneOfTheColumns: 'ни один столбец в этой таблице не распознан',
    thatFileIsNot: 'этот файл не является читаемой таблицей',
    thatSpreadsheetHasNo: 'в этой таблице нет строк с данными',
    thatSpreadsheetIsMissing: 'в таблице отсутствует обязательный столбец: {columns}',
    theSpreadsheetCouldNot: 'не удалось загрузить таблицу',
    thisResourceCannotBe: 'этот ресурс не поддерживает загрузку'
  },

  memberAuth: {
    certificateAgentTooOld: 'программа сертификатов на этом компьютере устарела — установите последнюю версию',
    certificateNotAccepted: 'сертификат не принят',
    certificateSignInIsNotEnabled: 'вход по сертификату на этом сайте не включён',
    simSignInIsNotEnabled: 'вход по SIM-карте на этом сайте не включён',
    thatSimCardWasNotAccepted: 'эта SIM-карта не принята',
    thisSimIsNotRegistered: 'эта SIM-карта ещё не зарегистрирована на сайте',
    aPasswordOfAt: 'пароль должен быть не короче 8 символов',
    aUserIdOf: 'идентификатор должен содержать 4–40 букв, цифр, точек, дефисов или подчёркиваний',
    passwordSignInIs: 'вход по паролю недоступен на этом устройстве',
    pleaseWaitSecondsBefore: 'подождите {n} с, прежде чем запрашивать новый код',
    thatCodeHasExpired: 'срок действия кода истёк — запросите новый',
    thatVerificationCodeIs: 'код подтверждения неверен',
    thoseSignInDetails: 'учётная запись с такими данными не найдена',
    tooManyAttemptsOn: 'слишком много попыток по этому коду — запросите новый',
    verificationCodeSignIn: 'вход по коду предназначен для мобильных устройств'
  },

  feedback: {
    threadIsResolved: 'это обращение закрыто — пожалуйста, создайте новое',
    threadIsFinished: 'это обращение закрылось без ответа — пожалуйста, создайте новое'
  },

  eproduct: {
    theServiceAddressIs: 'адрес сервиса eproduct не настроен в этой установке',
    aFaultHasAlready: 'о неисправности этой лицензии уже сообщено, заявка рассматривается',
    theServiceHasNot: 'сервис eproduct до сих пор не выдал лицензию по этой операции',
    theLicenceFileDidNot: 'сервис eproduct не прислал файл лицензии — попробуйте ещё раз чуть позже'
  },

  oldLogs: {
    balanceCarriedOver: 'перенесённый остаток'
  },

  permission: {
    pageNotRegisteredIn: 'страница не зарегистрирована в manager_pages: {page}'
  },

  repairTickets: {
    aTicketCannotBe: 'нельзя закрыть неоплаченную заявку',
    aTicketCannotBeClosed: 'нельзя закрыть заявку, пока не выданы все детали',
    aTicketCannotMove: 'заявка не может перейти из «{from}» в «{to}»',
    technicianWorksAtAnother: 'инженер {name} работает в другом сервисном центре',
    theCustomerNameAnd: 'нужно указать имя и телефон клиента',
    thisTicketIsAlready: 'эта заявка уже закрыта',
    thisTicketIsCancelled: 'эта заявка отменена'
  },

  replenishments: {
    aReplenishmentNeedsAt: 'в заказе на пополнение должна быть хотя бы одна строка',
    thisReplenishmentHasAlready: 'этот заказ на пополнение уже принят'
  },

  signing: {
    itemNoLongerMatches: 'эта запись больше не совпадает со своей подписью - её изменили в обход консоли, поэтому ничего не сохранено. Сначала запустите аудит подписей и проверьте её'
  },

  stock: {
    aMovementNeedsA: 'количество в движении не может быть нулевым',
    onlyOfAreAvailable: 'в этом сервисном центре доступно только {n} шт. «{part}»',
    thisPartIsNot: 'эта деталь не хранится в данном сервисном центре'
  },

  storefront: {
    chooseAtLeastProducts: 'выберите не менее {n} товаров для сравнения'
  },

  token: {
    tokenExpired: 'срок действия токена истёк'
  },

  scene: {
    aLayerNeedsAPicture: 'слою {layer} сцены нужно изображение',
    aPictureMustBeAnUpload: 'слой {layer} должен указывать на загруженный файл, а не на другой адрес',
    thatIsNotAScene: 'сцена должна быть объектом со списком слоёв',
    tooManyLayers: 'в сцене может быть не более {limit} слоёв',
    unknownAnimation: 'анимации с названием {name} не существует'
  },

  upload: {
    contentDoesNotMatchType: 'содержимое файла не является {declared} - файл должен быть того типа, который заявлен',
    onlyDocumentsAreAllowed: 'сюда можно загружать только документы ({types})',
    onlyImagesAreAllowed: 'сюда можно загружать только изображения ({types})',
    onlyXlsxSpreadsheetsCan: 'загрузить можно только таблицы .xlsx',
    unknownUploadFolder: 'неизвестная папка загрузки: {folder}'
  },

  wallet: {
    anAdjustmentNeedsA: 'для корректировки нужна причина',
    notEnoughBalance: 'недостаточно средств',
    notEnoughPoints: 'недостаточно баллов'
  },

  warranties: {
    warrantyRanFromTo: 'гарантия {id} действовала с {from} по {to}, а устройство поступило {arrived}',
    warrantyHasBeenVoided: 'гарантия {id} аннулирована',
    warrantyCoversDeviceNot: 'гарантия {id} распространяется на устройство {covers}, а не на {given}',
    warrantyDoesNotExist: 'гарантия {id} не существует',
    aCoveredRepairMust: 'гарантийный ремонт должен ссылаться на гарантию, по которой он выполняется',
    theWarrantyHasAlready: 'по этой гарантии уже было обращений: {n}',
    thisWarrantyHasBeen: 'эта гарантия аннулирована',
    warrantyNotFound: 'гарантия не найдена'
  },

  member: {
    youHaveAlreadyRegistered: 'вы уже зарегистрировали это устройство'
  },

  conflict: {
    thatTechnicianAlreadyHas: 'у этого инженера уже есть такой навык',
    thatPartAlreadyHasA: 'для этой детали в данном центре уже есть складская запись',
    thatPartIsAlreadyOn: 'эта деталь уже есть в заказе на пополнение',
    thatSpecificationIsAlready: 'эта характеристика уже задана для товара',
    thatFinishIsAlready: 'этот цвет уже добавлен для товара',
    thatRoleAlreadyHasA: 'у этой роли уже задано право на эту страницу',
    thatPartIsAlready: 'эта деталь уже добавлена к товару',
    aClaimForThatMonth: 'заявка за этот месяц для данного сервисного центра уже существует',
    thatServiceIsAlready: 'эта услуга уже добавлена для данного центра'
  },

  /* The CRM, one section per area - named after the service that throws it; `common` when several do. */
  crm: {
    common: {
      alreadyDecided: 'по этому совпадению уже принято решение',
      anotherManagerMustApprove: 'утвердить созданное вами должен другой менеджер',
      aReasonIsRequired: 'укажите причину',
      cannotMoveFromTo: 'нельзя перейти из {from} в {to}',
      checkTheDetails: 'некоторые данные неверны',
      chooseAChannel: 'выберите канал',
      chooseACustomer: 'выберите клиента',
      chooseAFile: 'выберите файл',
      chooseAnActiveCustomer: 'выберите активного клиента',
      chooseAnEventType: 'выберите тип мероприятия',
      codeAndNameAreRequired: 'укажите код и название',
      importFinished: 'импорт завершён',
      notAStatusYouCanSet: 'этот статус нельзя установить здесь',
      theRuleIsNotValidJson: 'правило не является корректным JSON',
      thisIsNotAnExcelFile: 'это не файл Excel (.xlsx)',
      thisPartyWasMerged: 'этот клиент объединён с другим',
      unknownChannel: 'неизвестный канал'
    },
    customers: {
      aCustomerCannotBeRelatedToThemselves: 'клиент не может быть связан сам с собой',
      alreadyUnlinked: 'этот аккаунт уже отвязан',
      chooseAGrade: 'выберите один из действующих корпоративных рейтингов',
      chooseAnAgreementType: 'выберите тип договора',
      chooseAnotherPartyToMerge: 'выберите другого клиента для объединения',
      chooseARelationship: 'выберите тип связи',
      chooseAStaffMember: 'выберите сотрудника',
      chooseATag: 'выберите метку',
      chooseATeamRole: 'выберите роль в команде клиента',
      chooseTheRelatedCustomer: 'выберите связанного клиента',
      contactValueIsRequired: 'укажите контактные данные',
      itCannotEndBeforeItStarts: 'окончание не может быть раньше начала',
      merged: 'клиенты объединены',
      notAConsentStatus: 'недопустимый статус согласия',
      nothingToMerge: 'нечего объединять',
      onlyForOrganizations: 'это возможно только для организации',
      onlyForPeople: 'добавить можно только физлицо',
      onlyPartiesOfOneType: 'объединять можно только лицо с лицом, организацию с организацией',
      projectAndAccountAreRequired: 'укажите проект и номер аккаунта',
      thatAccountIsAlreadyLinked: 'этот аккаунт уже привязан к клиенту',
      thatRelationshipHasEnded: 'эта связь уже завершена',
      thatRelationshipIsNotForThem: 'связь «{relationship}» не подходит для этих клиентов',
      thatWouldMakeACircle: 'так компания станет собственной материнской компанией',
      theyAlreadyHaveThatRole: 'у сотрудника уже есть эта роль для клиента',
      theyAreAlreadyRelatedThatWay: 'такая связь между ними уже есть',
      thisContactIsAlready: 'этот контакт уже есть у клиента',
      typeAndStartAreRequired: 'укажите тип и дату начала',
      unknownContactType: 'неизвестный тип контакта'
    },
    customerImport: {
      chooseAnActiveOriginProject: 'выберите действующий проект как проект-источник',
      noEshopProject: 'ни у одного проекта нет роли «Интернет-магазин»: задайте её проекту магазина в Настройки > Проекты',
      noUserManagementProject: 'ни у одного проекта нет роли «Управление пользователями»: задайте её проекту в Настройки > Проекты',
      requiredColumnsAreMissing: 'на листе нет обязательных столбцов',
      theFileHasNoRows: 'под заголовком нет строк',
      theFileHasNoSheet: 'в файле нет листа для чтения',
      tooManyRows: 'на листе может быть не более {max} человек'
    },
    customer360: {
      chooseAChannelThatCarriesMessages: 'выберите e-mail, SMS, push-уведомление или входящие участника',
      chooseHowItEnded: 'выберите, чем всё закончилось',
      chooseWhatItWasAbout: 'выберите, о чём шла речь',
      chooseWhatTheMessageIsFor: 'выберите цель сообщения',
      giveASummary: 'кратко опишите суть',
      messageQueued: 'сообщение поставлено в очередь на отправку',
      thatCaseIsAnotherCustomers: 'это обращение принадлежит другому клиенту',
      thatKindOfFileIsNotAccepted: 'такой файл не принимается: загрузите PDF или изображение',
      thatProjectDoesNotSendThat: 'этот проект не отправляет такие сообщения по этому каналу',
      theCustomerHasNoContactForThatChannel: 'у клиента нет действующего контакта для этого канала',
      theCustomerSaidNoToThat: 'клиент отказался или отозвал согласие на это',
      thereIsNoConsentForThat: 'нет действующего согласия: клиент сначала должен его дать',
      writeTheMessage: 'напишите тему и текст',
      writeTheNote: 'напишите заметку'
    },
    products: {
      aRequestIsAlreadyOpen: 'для этого товара уже открыт такой запрос',
      aSerialOrImeiIsRequired: 'укажите серийный номер или IMEI',
      chooseAnEndReason: 'выберите причину завершения',
      chooseAProduct: 'выберите товар',
      chooseTheNewDevice: 'выберите устройство для лицензии',
      chooseWhatShouldHappen: 'выберите действие с товаром',
      chooseWhoReceivesIt: 'выберите получателя',
      nobodyHoldsItThatWay: 'сейчас никто не владеет товаром таким образом',
      onlyALicenceCanBeRebound: 'перенести на другое устройство можно только лицензию',
      someoneElseHoldsThisProduct: 'этим товаром уже владеет другой клиент',
      thatSerialBelongsToAnotherProduct: 'этот серийный номер принадлежит другому товару',
      thatSerialIsAlreadyKnown: 'этот серийный номер уже есть в проекте',
      thisCustomerAlreadyHoldsItThatWay: 'клиент уже владеет товаром таким образом',
      thisProductAlreadyHasAnOwner: 'этот товар уже принадлежит клиенту {holder}',
      thisProductIsOutOfService: 'товар аннулирован или списан',
      thisRegistrationHasEnded: 'эта регистрация уже завершена',
      unknownRelationship: 'неизвестный тип связи'
    },
    points: {
      customerAndPointTypeAreRequired: 'укажите клиента и тип баллов',
      notEnoughPoints: 'недостаточно баллов: баланс {balance}, нужно {needed}',
      pointsMustNotBeZero: 'количество баллов не может быть нулевым',
      pointTypeIsInactive: 'этот тип баллов не используется',
      pointTypeNeedsAProject: 'у типа баллов {point_type} нет проекта-владельца: задайте его в Настройки > Типы баллов',
      unknownPointEvent: 'неизвестное событие баллов {code}',
      unknownPointType: 'неизвестный тип баллов'
    },
    memberships: {
      alreadyOnThatTier: 'участник уже на этом уровне',
      thatTierBelongsToAnotherProject: 'этот уровень принадлежит другому проекту'
    },
    serviceCases: {
      chooseAProject: 'выберите проект',
      customerAndCaseTypeAreRequired: 'укажите клиента и тип обращения',
      thisCaseFollowsARepairTicket: 'это обращение следует за ремонтной заявкой Crystal — меняйте его в заявке',
      unknownStatus: 'неизвестный статус'
    },
    sites: {
      aCapabilityIsRequired: 'укажите возможность',
      alreadyReversed: 'эта запись уже сторнирована',
      chooseASiteKind: 'выберите тип точки',
      codeNameAndKindAreRequired: 'укажите код, название и тип',
      siteAndActivityAreRequired: 'укажите точку и вид деятельности',
      thatTargetAlreadyExists: 'такой план для точки, вида и периода уже есть',
      theSiteAlreadyHasThat: 'у точки уже есть эта возможность',
      thisSiteCannotDoThat: 'у точки нет возможности {capability}',
      unknownActivity: 'неизвестный вид деятельности'
    },
    events: {
      addTargetsBeforeFreezing: 'перед фиксацией добавьте хотя бы одного участника',
      alreadyATarget: 'этот клиент уже участник мероприятия',
      alreadyRevoked: 'этот участник уже исключён',
      anAddressIsRequired: 'укажите адрес доставки',
      awardsNeedAnOpenEvent: 'награды выдаются, когда мероприятие открыто или закрыто',
      chooseWhereItIsCollected: 'выберите точку выдачи',
      chooseWhoMayTakePart: 'выберите, кто может участвовать',
      giveTheWalletReference: 'укажите номер операции кошелька',
      noEntriesLeft: 'у клиента не осталось попыток',
      noNumbersLeft: 'номера в этом диапазоне закончились',
      notWhileTheEventIs: 'недоступно, пока мероприятие в статусе {status}',
      onlyWalletCreditsAreCredited: 'зачисляется только награда на кошелёк',
      reservationsAreStillOpen: 'открытых резервов: {n}',
      targetsAreFrozen: 'список участников зафиксирован',
      targetsBuilt: 'участники добавлены',
      thatQuotaAlreadyExists: 'такая квота уже есть',
      thatSiteIsAlreadyInTheEvent: 'эта точка уже участвует в этой роли',
      thatSiteIsNotInThisEvent: 'эта точка не участвует в мероприятии',
      theEventHasEnded: 'мероприятие завершено',
      theEventHasNotStarted: 'мероприятие ещё не началось',
      theEventIsNotOpen: 'мероприятие не открыто',
      theQuotaIsFull: 'квота исчерпана',
      theRuleNeedsAnActivity: 'в правиле нужен вид деятельности',
      theRuleNeedsAProductClass: 'в правиле нужен класс товара',
      thisBasisHasNothingToBuild: 'по этому основанию список не строится — добавьте участников вручную',
      thisCustomerIsNotATarget: 'этот клиент не участник мероприятия',
      thisIdCardHasAnEntry: 'по этому удостоверению уже есть запись в мероприятии',
      thisQuotaIsInUse: 'квота используется, удалить нельзя',
      thisRewardHasBeenAwarded: 'награда уже выдавалась, удалить нельзя',
      thisRewardIsAllGone: 'эта награда закончилась',
      tiersAreFixedOnceTargetsAreFrozen: 'после фиксации участников уровни менять нельзя'
    },
    marketing: {
      approveTheCampaignFirst: 'сначала утвердите кампанию',
      audienceAndPurposeAreRequired: 'укажите аудиторию и цель',
      campaignNeedsAProject: 'сначала выберите проект кампании: что можно отправлять, задаётся по проекту',
      chooseACampaignType: 'выберите тип кампании',
      chooseACostType: 'выберите тип расхода',
      chooseAnAudienceType: 'выберите источник аудитории',
      chooseAnEvent: 'выберите мероприятие',
      chooseASegment: 'выберите сегмент',
      chooseAtLeastOneCustomer: 'выберите хотя бы одного клиента',
      codeNameAndTypeAreRequired: 'укажите код, название и тип',
      evaluated: 'сегмент пересчитан',
      nameTheAudience: 'назовите аудиторию',
      onlyADraftActionCanChange: 'изменять можно только черновик действия',
      prepared: 'получатели подготовлены',
      theRuleIsEmpty: 'правило пустое',
      theRuleIsTooDeep: 'правило слишком глубоко вложено',
      theRuleNeedsAValue: 'для условия «{field}» нужно значение {value}',
      thisActionIsAlreadyPrepared: 'это действие уже подготовлено',
      thisCampaignIsFinished: 'кампания завершена',
      thisSegmentIsArchived: 'сегмент в архиве',
      unknownRuleField: 'в правиле нельзя использовать «{field}»'
    },
    analysis: {
      analysisFinished: 'анализ завершён'
    },
    settings: {
      anotherProjectHasThatRole: 'эта роль уже есть у другого проекта: сначала снимите её там (одна роль - один проект)',
      aValueIsTooLong: 'значение длиннее, чем допускает {column}',
      inUseCannotChangeCode: 'код {code} используется в {tables}, его нельзя изменить; измените название или сначала удалите эти записи',
      inUseCannotDelete: '{code} используется в {tables}; сначала удалите эти записи',
      projectCodeAndStatusAreRequired: 'укажите проект, исходный код и статус',
      recalculated: 'показатели пересчитаны',
      thatCodeIsTaken: 'этот код уже используется',
      thatOptionAlreadyExists: 'такая комбинация проекта, цели и канала уже есть',
      thatRoleIsForAnotherDepartment: 'роль этого менеджера предназначена для другого отдела',
      thisCodeIsUsedByTheSystem: 'код {code} используется системой, его нельзя менять или удалять'
    }
  }
};
