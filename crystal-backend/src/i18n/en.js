/**
 * ENGLISH, AS AN ADDRESSED CATALOG.
 *
 * The key is an ADDRESS - `memberAuth.thatCodeHasExpired` - held in a section
 * named after the module that sends the message. It used to be the English
 * sentence itself, which read well at the throw site and had one flaw that
 * mattered: rewording a reply moved the key, and the Chinese hanging off the
 * old wording was orphaned in silence.
 *
 * With an address, the English wording is changed HERE, the key stays where
 * it is, and no translation is lost to a copy edit. It also means the strings
 * one module can send sit together, so a section can be read as the list of
 * everything that module tells a user.
 *
 * A MESSAGE SENT FROM MORE THAN ONE MODULE is in `common`, because it belongs
 * to no single one. `common.notFound` is sent from a dozen places and would
 * otherwise be a dozen entries drifting apart.
 *
 * This file and zh.js carry the SAME ADDRESSES. scripts/check.js asserts it,
 * along with the rule that every address a throw site names actually resolves
 * - an address that does not would be answered to the user AS the address,
 * which is the one failure this shape introduces and the one it must catch.
 *
 * {name} placeholders carry data - dates, counts, ticket numbers - and are
 * filled in after the lookup, so they can sit wherever the sentence needs
 * them rather than always at the end.
 */
module.exports = {
  auth: {
    administratorSignInRequired: 'administrator sign-in required',
    incorrectUsernameOrPassword: 'incorrect username or password',
    pleaseSignInTo: 'please sign in to continue',
    thisAdministratorAccountIs: 'this administrator account is disabled'
  },

  blog: {
    aPostNeedsWords: 'a post needs something to say',
    thePostIsTooLong: 'the post is too long - please shorten it',
    alreadyGiven: 'you have already given this a thumb, and a thumb cannot be changed',
    alreadySubmitted: 'this post has already been sent to be read, so it cannot go back to being a draft',
    anArticleNeedsAShelf: 'an article needs a shelf to sit on',
    anArticleNeedsATitle: 'an article needs a title',
    noSuchShelf: 'that is not a shelf on this blog',
    notOnYourOwn: 'you cannot give a thumb to your own writing',
    oneArticleADay: 'you have already posted an article today - you can post the next one tomorrow',
    oneReplyADay: 'you have already replied today - you can reply again tomorrow',
    thatIsNotAThumb: 'a thumb is gold, silver or bronze',
    threadIsNotOpen: 'that conversation is not open for replies'
  },

  agencies: {
    aPhoneNumberIsTooLong: 'a phone number can be at most 40 characters: {phone}',
    aPhoneLabelIsTooLong: 'the label on a phone number can be at most 60 characters: {label}',
    phonesMustBeAList: 'phone numbers must be sent as a list of numbers',
    thereIsNoProvinceCalled: 'there is no province called "{province}" - add it on the Provinces screen first'
  },

  claims: {
    aClaimForAlready: 'a claim for {month} already exists at this service centre',
    aRejectedClaimNeeds: 'a rejected claim needs a reason',
    thereAreNoCovered: 'there are no covered repairs to claim for {month}',
    thisClaimHasAlready: 'this claim has already been paid'
  },

  common: {
    isNotAValue: '"{value}" is not a value {type} accepts',
    isRequired: '{column} is required',
    aRequiredValueIs: 'a required value is missing',
    aServiceCentreIs: 'a service centre is required',
    created: 'created',
    deleted: 'deleted',
    duplicatedValue: 'duplicated value',
    internalServerError: 'internal server error',
    invalidToken: 'invalid token',
    moveItToThe: 'move it to the recycle bin first',
    notFound: 'not found',
    nothingToUpdate: 'nothing to update',
    ok: 'ok',
    otherRecordsStillRefer: 'other records still refer to this one',
    partNotFound: 'part not found',
    permissionDenied: 'permission denied',
    referencedRecordIsMissing: 'referenced record is missing or still in use',
    restored: 'restored',
    sent: 'sent',
    signedIn: 'signed in',
    signedOut: 'signed out',
    theDeviceSerialNumber: 'the device serial number is required',
    theNewPasswordMust: 'the new password must be at least {n} characters',
    theOldPasswordIs: 'the old password is not correct',
    thisAccountIs: 'this account is {status}',
    thisSerialNumberIs: 'this serial number is already registered',
    ticketNotFound: 'ticket not found',
    updated: 'updated',
    valueFailedAValidation: 'value failed a validation rule'
  },

  crud: {
    thisResourceIsNot: 'this resource is not soft deleted'
  },

  error: {
    endpointNotFound: 'endpoint not found: {method} {url}'
  },

  excel: {
    nothingToWriteOn: 'nothing to write on this row',
    imported: 'imported',
    noSpreadsheetWasUploaded: 'no spreadsheet was uploaded',
    noneOfTheColumns: 'none of the columns in that spreadsheet were recognised',
    thatFileIsNot: 'that file is not a readable spreadsheet',
    thatSpreadsheetHasNo: 'that spreadsheet has no rows in it',
    thatSpreadsheetIsMissing: 'that spreadsheet is missing a required column: {columns}',
    theSpreadsheetCouldNot: 'the spreadsheet could not be imported',
    thisResourceCannotBe: 'this resource cannot be imported'
  },

  memberAuth: {
    certificateAgentTooOld: 'the certificate program on this computer is too old - please install the latest version',
    certificateNotAccepted: 'the certificate was not accepted',
    certificateSignInIsNotEnabled: 'certificate sign-in is not enabled on this site',
    simSignInIsNotEnabled: 'SIM sign-in is not enabled on this site',
    thatSimCardWasNotAccepted: 'that SIM card was not accepted',
    thisSimIsNotRegistered: 'this SIM has not been registered on this site yet',
    aPasswordOfAt: 'a password of at least 8 characters is required',
    aUserIdOf: 'a user ID of 4-40 letters, digits, dot, dash or underscore is required',
    passwordSignInIs: 'password sign-in is not available on this device',
    pleaseWaitSecondsBefore: 'please wait {n} seconds before asking for another code',
    thatCodeHasExpired: 'that code has expired - please request a new one',
    thatVerificationCodeIs: 'that verification code is not correct',
    thoseSignInDetails: 'those sign-in details did not match an account',
    tooManyAttemptsOn: 'too many attempts on this code - please request a new one',
    verificationCodeSignIn: 'verification-code sign-in is for mobile devices'
  },

  feedback: {
    threadIsResolved: 'this enquiry has been resolved - please open a new one',
    threadIsFinished: 'this enquiry was closed without an answer - please open a new one'
  },

  /*
   * The eproduct site, in the member's own language rather than in its.
   *
   * A refusal the SERVICE sends is passed through as the sentence it sent -
   * it is data, not an address, and translate() leaves it alone. These two
   * are Crystal's own rules about the same rows, so they are addresses.
   */
  eproduct: {
    theServiceAddressIs: 'the eproduct service address is not configured on this deployment',
    aFaultHasAlready: 'a fault has already been reported for this licence and is being looked at',
    theServiceHasNot: 'the eproduct service has still not issued a licence for this keying',
    theLicenceFileDidNot: 'the eproduct service did not send the licence file - try again in a moment'
  },

  /*
   * THE ONE LINE CRYSTAL WRITES ON THE OLD LOG PAGES.
   *
   * Every other cell on those three pages is a number or a string the old
   * systems recorded, and none of it is translatable - a machine key is a
   * machine key in any language. The carry-forward row is different: it is
   * not a licence, it has no reason of its own, and the vendor hard-coded
   * an English sentence into the SELECT (`'Balance carried over' as reason`).
   * A member reading the page in Chinese got that sentence in English, in a
   * column where every other value was data.
   */
  oldLogs: {
    balanceCarriedOver: 'balance carried over'
  },

  permission: {
    pageNotRegisteredIn: 'page not registered in manager_pages: {page}'
  },

  repairTickets: {
    aTicketCannotBe: 'a ticket cannot be closed while it is unpaid',
    aTicketCannotBeClosed: 'a ticket cannot be closed with parts still unissued',
    aTicketCannotMove: 'a ticket cannot move from {from} to {to}',
    technicianWorksAtAnother: 'technician {name} works at another service centre',
    theCustomerNameAnd: 'the customer name and phone are required',
    thisTicketIsAlready: 'this ticket is already closed',
    thisTicketIsCancelled: 'this ticket is cancelled'
  },

  replenishments: {
    aReplenishmentNeedsAt: 'a replenishment needs at least one line',
    thisReplenishmentHasAlready: 'this replenishment has already been received'
  },

  signing: {
    itemNoLongerMatches: 'this item no longer matches its signature - it was changed outside the console, so nothing was saved. Run the signing audit and review it first'
  },

  stock: {
    aMovementNeedsA: 'a movement needs a non zero quantity',
    onlyOfAreAvailable: 'only {n} of {part} are available at this service centre',
    thisPartIsNot: 'this part is not stocked at this service centre'
  },

  storefront: {
    chooseAtLeastProducts: 'choose at least {n} products to compare'
  },

  token: {
    tokenExpired: 'token expired'
  },

  scene: {
    aLayerNeedsAPicture: 'the {layer} layer of a scene needs a picture',
    aPictureMustBeAnUpload: 'the {layer} layer must point at an uploaded file, not at another address',
    thatIsNotAScene: 'a scene must be an object with a list of layers',
    tooManyLayers: 'a scene may have at most {limit} layers',
    unknownAnimation: 'there is no animation called {name}'
  },

  upload: {
    contentDoesNotMatchType: 'the file\'s contents are not {declared} - a file must be the type it says it is',
    onlyDocumentsAreAllowed: 'only documents are allowed here ({types})',
    onlyImagesAreAllowed: 'only images are allowed here ({types})',
    onlyXlsxSpreadsheetsCan: 'only .xlsx spreadsheets can be imported',
    unknownUploadFolder: 'unknown upload folder: {folder}'
  },

  wallet: {
    anAdjustmentNeedsA: 'an adjustment needs a reason',
    notEnoughBalance: 'not enough balance',
    notEnoughPoints: 'not enough points'
  },

  warranties: {
    warrantyRanFromTo: 'warranty {id} ran from {from} to {to}, and the device arrived on {arrived}',
    warrantyHasBeenVoided: 'warranty {id} has been voided',
    warrantyCoversDeviceNot: 'warranty {id} covers device {covers}, not {given}',
    warrantyDoesNotExist: 'warranty {id} does not exist',
    aCoveredRepairMust: 'a repair booked under warranty has to name the warranty covering it',
    theWarrantyHasAlready: 'the warranty has already been claimed {n} times',
    thisWarrantyHasBeen: 'this warranty has been voided',
    warrantyNotFound: 'warranty not found'
  },

  member: {
    youHaveAlreadyRegistered: 'you have already registered this device'
  },

  conflict: {
    thatTechnicianAlreadyHas: 'that technician already has this skill',
    thatPartAlreadyHasA: 'that part already has a shelf record at this centre',
    thatPartIsAlreadyOn: 'that part is already on this replenishment',
    thatSpecificationIsAlready: 'that specification is already set on this product',
    thatFinishIsAlready: 'that finish is already listed for this product',
    thatRoleAlreadyHasA: 'that role already has a permission for this page',
    thatPartIsAlready: 'that part is already listed for this product',
    aClaimForThatMonth: 'a claim for that month already exists at this service centre',
    thatServiceIsAlready: 'that service is already listed for this centre'
  },

  /* The CRM, one section per area - named after the service that throws it; `common` when several do. */
  crm: {
    common: {
      alreadyDecided: 'this match has already been decided',
      anotherManagerMustApprove: 'another manager has to approve what you created',
      aReasonIsRequired: 'a reason is required',
      cannotMoveFromTo: 'cannot move from {from} to {to}',
      checkTheDetails: 'some details are not valid',
      chooseAChannel: 'choose a channel',
      chooseACustomer: 'choose a customer',
      chooseAFile: 'choose a file',
      chooseAnActiveCustomer: 'choose an active customer',
      chooseAnEventType: 'choose an event type',
      codeAndNameAreRequired: 'a code and a name are required',
      importFinished: 'import finished',
      notAStatusYouCanSet: 'not a status that can be set here',
      theRuleIsNotValidJson: 'the rule is not valid JSON',
      thisIsNotAnExcelFile: 'this is not an Excel (.xlsx) file',
      thisPartyWasMerged: 'this customer was merged into another one',
      unknownChannel: 'unknown channel'
    },
    customers: {
      aCustomerCannotBeRelatedToThemselves: 'a customer cannot be related to themselves',
      alreadyUnlinked: 'this account is already unlinked',
      chooseAGrade: 'choose one of the active corporate grades',
      chooseAnAgreementType: 'choose an agreement type',
      chooseAnotherPartyToMerge: 'choose another customer to merge into this one',
      chooseARelationship: 'choose a relationship',
      chooseAStaffMember: 'choose a staff member',
      chooseATag: 'choose a tag',
      chooseATeamRole: 'choose a role in the account team',
      chooseTheRelatedCustomer: 'choose the related customer',
      contactValueIsRequired: 'the contact value is required',
      itCannotEndBeforeItStarts: 'it cannot end before it starts',
      merged: 'customers merged',
      notAConsentStatus: 'not a consent status',
      nothingToMerge: 'there is nothing to merge',
      onlyForOrganizations: 'only an organization can have that',
      onlyForPeople: 'only a person can be added there',
      onlyPartiesOfOneType: 'a person can only be merged with a person, and an organization with an organization',
      projectAndAccountAreRequired: 'a project and an account id are required',
      thatAccountIsAlreadyLinked: 'that account is already linked to a customer',
      thatRelationshipHasEnded: 'that relationship has already ended',
      thatRelationshipIsNotForThem: '"{relationship}" does not apply to these two customers',
      thatWouldMakeACircle: 'that would make a company its own parent',
      theyAlreadyHaveThatRole: 'they already have that role for this customer',
      theyAreAlreadyRelatedThatWay: 'they are already related that way',
      thisContactIsAlready: 'this contact is already on this customer',
      typeAndStartAreRequired: 'the type and the start date are required',
      unknownContactType: 'unknown contact type'
    },
    customerImport: {
      chooseAnActiveOriginProject: 'choose an active project as the origin project',
      noEshopProject: 'no project has the E-shop identity role: set it on the e-shop project in Settings > Projects',
      noUserManagementProject: 'no project has the User management identity role: set it on the user management project in Settings > Projects',
      requiredColumnsAreMissing: 'the sheet is missing required columns',
      theFileHasNoRows: 'the sheet has no rows below the header',
      theFileHasNoSheet: 'the file has no sheet to read',
      tooManyRows: 'a sheet can hold at most {max} people'
    },
    customer360: {
      chooseAChannelThatCarriesMessages: 'choose email, SMS, app push or the member inbox',
      chooseHowItEnded: 'choose how it ended',
      chooseWhatItWasAbout: 'choose what it was about',
      chooseWhatTheMessageIsFor: 'choose what the message is for',
      giveASummary: 'give a short summary',
      messageQueued: 'message queued for sending',
      thatCaseIsAnotherCustomers: 'that service case belongs to another customer',
      thatKindOfFileIsNotAccepted: 'that kind of file is not accepted - send a PDF or a picture',
      thatProjectDoesNotSendThat: 'that project does not send that kind of message on that channel',
      theCustomerHasNoContactForThatChannel: 'the customer has no usable contact for that channel',
      theCustomerSaidNoToThat: 'the customer declined or withdrew consent for that',
      thereIsNoConsentForThat: 'there is no consent in force for that - the customer has to opt in first',
      writeTheMessage: 'write a subject and a message',
      writeTheNote: 'write the note'
    },
    products: {
      aRequestIsAlreadyOpen: 'a request of this kind is already open for this product',
      aSerialOrImeiIsRequired: 'a serial number or an IMEI is required',
      chooseAnEndReason: 'choose why it ends',
      chooseAProduct: 'choose a product',
      chooseTheNewDevice: 'choose the device the licence moves to',
      chooseWhatShouldHappen: 'choose what should happen to the product',
      chooseWhoReceivesIt: 'choose who receives it',
      nobodyHoldsItThatWay: 'nobody holds this product that way now',
      onlyALicenceCanBeRebound: 'only a licence can be moved to another device',
      someoneElseHoldsThisProduct: 'someone else already holds this product',
      thatSerialBelongsToAnotherProduct: 'that serial number belongs to another product',
      thatSerialIsAlreadyKnown: 'that serial number is already known in this project',
      thisCustomerAlreadyHoldsItThatWay: 'this customer already holds this product that way',
      thisProductAlreadyHasAnOwner: 'this product already belongs to {holder}',
      thisProductIsOutOfService: 'this product is void or scrapped',
      thisRegistrationHasEnded: 'this registration has already ended',
      unknownRelationship: 'unknown relationship'
    },
    points: {
      customerAndPointTypeAreRequired: 'a customer and a point type are required',
      notEnoughPoints: 'not enough points: the balance is {balance}, {needed} are needed',
      pointsMustNotBeZero: 'the points must not be zero',
      pointTypeIsInactive: 'this point type is not in use',
      pointTypeNeedsAProject: 'point type {point_type} has no owner project: set one in Settings > Point types',
      unknownPointEvent: 'unknown point event {code}',
      unknownPointType: 'unknown point type'
    },
    memberships: {
      alreadyOnThatTier: 'the member is already on that tier',
      thatTierBelongsToAnotherProject: 'that tier belongs to another project'
    },
    serviceCases: {
      chooseAProject: 'choose a project',
      customerAndCaseTypeAreRequired: 'a customer and a case type are required',
      thisCaseFollowsARepairTicket: 'this case follows a Crystal repair ticket - change it on the ticket',
      unknownStatus: 'unknown status'
    },
    sites: {
      aCapabilityIsRequired: 'name the capability',
      alreadyReversed: 'this activity has already been reversed',
      chooseASiteKind: 'choose what kind of site this is',
      codeNameAndKindAreRequired: 'a code, a name and a kind are required',
      siteAndActivityAreRequired: 'a site and an activity are required',
      thatTargetAlreadyExists: 'a target for that site, activity and period already exists',
      theSiteAlreadyHasThat: 'the site already has that capability',
      thisSiteCannotDoThat: 'this site does not have the {capability} capability',
      unknownActivity: 'unknown activity type'
    },
    events: {
      addTargetsBeforeFreezing: 'add at least one target before freezing the list',
      alreadyATarget: 'this customer is already a target of this event',
      alreadyRevoked: 'this target has already been revoked',
      anAddressIsRequired: 'a delivery address is required',
      awardsNeedAnOpenEvent: 'rewards are awarded while the event is open or closed',
      chooseWhereItIsCollected: 'choose the site where it is collected',
      chooseWhoMayTakePart: 'choose who may take part',
      giveTheWalletReference: 'give the wallet transaction reference',
      noEntriesLeft: 'this customer has no entries left',
      noNumbersLeft: 'there are no numbers left in this range',
      notWhileTheEventIs: 'not while the event is {status}',
      onlyWalletCreditsAreCredited: 'only a wallet reward is credited',
      reservationsAreStillOpen: '{n} reservations are still open',
      targetsAreFrozen: 'the target list is frozen',
      targetsBuilt: 'targets added',
      thatQuotaAlreadyExists: 'a quota for that already exists',
      thatSiteIsAlreadyInTheEvent: 'that site already takes part in this role',
      thatSiteIsNotInThisEvent: 'that site does not take part in this event',
      theEventHasEnded: 'the event has ended',
      theEventHasNotStarted: 'the event has not started yet',
      theEventIsNotOpen: 'the event is not open',
      theQuotaIsFull: 'the quota is full',
      theRuleNeedsAnActivity: 'the rule needs an activity type',
      theRuleNeedsAProductClass: 'the rule needs a product class',
      thisBasisHasNothingToBuild: 'this eligibility basis has no list to build - add targets by hand',
      thisCustomerIsNotATarget: 'this customer is not a target of this event',
      thisIdCardHasAnEntry: 'this ID card already has an entry in this event',
      thisQuotaIsInUse: 'this quota is in use and cannot be deleted',
      thisRewardHasBeenAwarded: 'this reward has been awarded and cannot be deleted',
      thisRewardIsAllGone: 'this reward is all gone',
      tiersAreFixedOnceTargetsAreFrozen: 'tiers are fixed once the targets are frozen'
    },
    marketing: {
      approveTheCampaignFirst: 'approve the campaign before preparing its actions',
      audienceAndPurposeAreRequired: 'an audience and a purpose are required',
      campaignNeedsAProject: 'choose the project of the campaign first: what may be sent is set per project',
      chooseACampaignType: 'choose a campaign type',
      chooseACostType: 'choose a cost type',
      chooseAnAudienceType: 'choose where the audience comes from',
      chooseAnEvent: 'choose an event',
      chooseASegment: 'choose a segment',
      chooseAtLeastOneCustomer: 'choose at least one customer',
      codeNameAndTypeAreRequired: 'a code, a name and a type are required',
      evaluated: 'segment evaluated',
      nameTheAudience: 'name the audience',
      onlyADraftActionCanChange: 'only a draft action can be changed',
      prepared: 'recipients prepared',
      theRuleIsEmpty: 'the rule is empty',
      theRuleIsTooDeep: 'the rule is nested too deeply',
      theRuleNeedsAValue: 'the condition "{field}" needs a value for {value}',
      thisActionIsAlreadyPrepared: 'this action has already been prepared',
      thisCampaignIsFinished: 'this campaign is finished',
      thisSegmentIsArchived: 'this segment is archived',
      unknownRuleField: 'the rule cannot use "{field}"'
    },
    analysis: {
      analysisFinished: 'analysis finished'
    },
    settings: {
      anotherProjectHasThatRole: 'another project already has that identity role: clear it there first (one project per role)',
      aValueIsTooLong: 'a value is longer than {column} allows',
      inUseCannotChangeCode: 'the code {code} is in use by {tables}, so it cannot be changed; edit the name instead, or remove those records first',
      inUseCannotDelete: '{code} is in use by {tables}; remove those records first',
      projectCodeAndStatusAreRequired: 'a project, a source code and a status are required',
      recalculated: 'figures recalculated',
      thatCodeIsTaken: 'that code is already in use',
      thatOptionAlreadyExists: 'that project, purpose and channel are already set up',
      thatRoleIsForAnotherDepartment: 'the role of that manager is meant for another department',
      thisCodeIsUsedByTheSystem: 'the code {code} is used by the system and cannot be changed or deleted'
    }
  }
};
