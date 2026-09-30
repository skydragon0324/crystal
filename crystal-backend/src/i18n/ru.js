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
  }
};
