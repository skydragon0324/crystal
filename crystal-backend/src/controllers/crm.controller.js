const { ok, page } = require('../utils/response');
const { readPaging } = require('../utils/query');

const vocabulary = require('../repositories/crm/vocabulary.repository');
const analysis = require('../services/crm/analysis.service');
const crystalImport = require('../services/crm/crystalImport.service');
const parties = require('../services/crm/parties.service');
const products = require('../services/crm/products.service');
const cases = require('../services/crm/cases.service');
const points = require('../services/crm/points.service');
const programs = require('../services/crm/programs.service');
const sites = require('../services/crm/sites.service');
const marketing = require('../services/crm/marketing.service');
const vendorImport = require('../services/crm/vendorImport.service');
const analysisRun = require('../services/crm/analysisRun.service');
const analysisRead = require('../services/crm/analysisRead.service');
const transactionsService = require('../services/crm/transactions.service');
const memberships = require('../services/crm/memberships.service');
const organizations = require('../services/crm/organizations.service');
const departments = require('../services/crm/departments.service');
const customer360 = require('../services/crm/customer360.service');
const relationships = require('../services/crm/relationships.service');
const engagement = require('../services/crm/engagement.service');
const accountTeam = require('../services/crm/accountTeam.service');
const crmSearch = require('../services/crm/search.service');

/**
 * The CRM's HTTP half: query string and body in, the envelope out.
 *
 * Nothing here decides anything. Each handler reads the paging, hands the
 * filters it was given to a service, and wraps what comes back - the rules
 * are all in services/crm, where a script or a job can reach them without an
 * HTTP request.
 */

/** A list handler over a service's search(filters, paging). */
function lister(search, sortable, fallback, dir) {
  return async function (req, res) {
    const query = Object.assign({ dir: dir || 'desc' }, req.query);
    const paging = readPaging(query, sortable || [], fallback || 'id');
    return page(res, await search(req.query, paging), paging);
  };
}

/** A list handler scoped to the :id in the url. */
function scopedLister(search, param) {
  return async function (req, res) {
    const paging = readPaging(Object.assign({ dir: 'desc' }, req.query), [], 'id');
    return page(res, await search(req.params[param || 'id'], req.query, paging), paging);
  };
}

module.exports = {
  /* ---- shared ---- */
  meta: async function (req, res) { return ok(res, await vocabulary.all()); },
  overview: async function (req, res) { return ok(res, await analysis.overview()); },

  importCrystal: async function (req, res) {
    const summary = await crystalImport.run();
    require('../services/audit.service').imported(req.actor, 'crm_party', summary, '/admin/crm/overview');
    return ok(res, summary, 'crm.importFinished');
  },

  importVendor: async function (req, res) {
    const summary = await vendorImport.run();
    require('../services/audit.service').imported(req.actor, 'crm_transaction', summary, '/admin/crm/overview');
    return ok(res, summary, 'crm.importFinished');
  },

  /* ---- analysis ---- */
  analysis: {
    run: async function (req, res) {
      const result = await analysisRun.run({ referenceDate: req.body && req.body.reference_date });
      require('../services/audit.service').imported(req.actor, 'crm_party_analysis_snapshot', result, '/admin/crm/analysis');
      return ok(res, result, 'crm.analysisFinished');
    },
    summary: async function (req, res) { return ok(res, await analysisRead.summary(req.query.reference_date)); },
    snapshots: lister(analysisRead.snapshots, [], 'corporate_score'),
    metrics: lister(analysisRead.metricValues, [], 'numeric_value'),
    model: async function (req, res) { return ok(res, { version: analysisRun.MODEL_VERSION, parts: analysisRun.MODEL }); }
  },

  /* ---- transactions ---- */
  transactions: {
    list: lister(transactionsService.search, ['transaction_at', 'net_amount', 'reporting_net_amount'], 'transaction_at'),
    detail: async function (req, res) { return ok(res, await transactionsService.detail(req.params.id)); }
  },

  /* ---- memberships ---- */
  memberships: {
    list: lister(memberships.search, ['tier_value', 'joined_at', 'available_reward_points'], 'membership_id'),
    distribution: async function (req, res) { return ok(res, await memberships.distribution()); },
    history: async function (req, res) { return ok(res, await memberships.history(req.params.id)); },
    setTier: async function (req, res) { return ok(res, await memberships.setTier(req.params.id, req.body, req.actor), 'common.updated'); },
    setStatus: async function (req, res) {
      return ok(res, await memberships.setStatus(req.params.id, req.body.membership_status, req.actor), 'common.updated');
    }
  },

  /* ---- organizations ---- */
  /* ---- customer 360 ---- */
  customer360: {
    overview: async function (req, res) { return ok(res, await customer360.overview(req.params.id)); },
    search: async function (req, res) { return ok(res, await crmSearch.search(req.query.q)); },
    addRelationship: async function (req, res) { return ok(res, await relationships.add(req.params.id, req.body, req.actor), 'common.created'); },
    endRelationship: async function (req, res) {
      return ok(res, await relationships.end(req.params.id, req.params.relationshipId, req.actor), 'common.updated');
    },
    addTag: async function (req, res) { return ok(res, await relationships.addTag(req.params.id, req.body, req.actor), 'common.created'); },
    removeTag: async function (req, res) {
      await relationships.removeTag(req.params.id, req.params.tagId, req.actor);
      return ok(res, null, 'common.deleted');
    },
    notes: scopedLister(engagement.notes),
    addNote: async function (req, res) { return ok(res, await engagement.addNote(req.params.id, req.body, req.actor), 'common.created'); },
    updateNote: async function (req, res) {
      return ok(res, await engagement.updateNote(req.params.id, req.params.noteId, req.body, req.actor), 'common.updated');
    },
    removeNote: async function (req, res) {
      await engagement.removeNote(req.params.id, req.params.noteId, req.actor);
      return ok(res, null, 'common.deleted');
    },
    files: async function (req, res) { return ok(res, await engagement.files(req.params.id)); },
    addFile: async function (req, res) { return ok(res, await engagement.addFile(req.params.id, req.file, req.body, req.actor), 'common.created'); },
    /* A customer's document goes out as an attachment the browser saves, never as a page it renders. */
    downloadFile: async function (req, res) {
      const found = await engagement.fileForDownload(req.params.id, req.params.fileId);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'");
      return res.download(found.absolute, found.row.file_name);
    },
    removeFile: async function (req, res) {
      await engagement.removeFile(req.params.id, req.params.fileId, req.actor);
      return ok(res, null, 'common.deleted');
    },
    interactions: scopedLister(engagement.interactions),
    logInteraction: async function (req, res) {
      return ok(res, await engagement.logInteraction(req.params.id, req.body, req.actor), 'common.created');
    },
    sendMessage: async function (req, res) { return ok(res, await engagement.sendMessage(req.params.id, req.body, req.actor), 'crm.messageQueued'); },
    team: async function (req, res) { return ok(res, await accountTeam.team(req.params.id)); },
    assignTeam: async function (req, res) { return ok(res, await accountTeam.assign(req.params.id, req.body, req.actor), 'common.updated'); },
    endTeam: async function (req, res) {
      return ok(res, await accountTeam.endAssignment(req.params.id, req.params.teamMemberId, req.actor), 'common.updated');
    },
    agreements: async function (req, res) { return ok(res, await accountTeam.agreements(req.params.id)); },
    createAgreement: async function (req, res) {
      return ok(res, await accountTeam.saveAgreement(req.params.id, null, req.body, req.actor), 'common.created');
    },
    updateAgreement: async function (req, res) {
      return ok(res, await accountTeam.saveAgreement(req.params.id, req.params.agreementId, req.body, req.actor), 'common.updated');
    }
  },

  organizations: {
    assignType: async function (req, res) { return ok(res, await organizations.assignType(req.params.id, req.body, req.actor), 'common.created'); },
    endType: async function (req, res) {
      return ok(res, await organizations.endType(req.params.id, req.params.assignmentId, req.actor), 'common.updated');
    },
    setIndustry: async function (req, res) { return ok(res, await organizations.setIndustry(req.params.id, req.body, req.actor), 'common.updated'); },
    removeIndustry: async function (req, res) {
      await organizations.removeIndustry(req.params.id, req.params.industryId, req.actor);
      return ok(res, null, 'common.deleted');
    },
    addPerson: async function (req, res) { return ok(res, await organizations.addPerson(req.params.id, req.body, req.actor), 'common.created'); },
    endPerson: async function (req, res) {
      return ok(res, await organizations.endPerson(req.params.id, req.params.relationshipId, req.actor), 'common.updated');
    }
  },

  /* ---- departments ---- */
  departments: {
    staff: async function (req, res) { return ok(res, await departments.staff()); },
    roles: async function (req, res) { return ok(res, await departments.roles()); },
    assignManager: async function (req, res) {
      return ok(res, await departments.assignManager(req.params.managerId, req.body.department_id, req.actor), 'common.updated');
    },
    setRoleDepartment: async function (req, res) {
      return ok(res, await departments.setRoleDepartment(req.params.roleId, req.body.department_id, req.actor), 'common.updated');
    }
  },

  recalculate: async function (req, res) {
    return ok(res, { class_stats: await analysis.recalculateClassStats() }, 'crm.recalculated');
  },

  /* ---- customers ---- */
  parties: {
    list: lister(parties.search, Object.keys(require('../repositories/crm/parties.repository').SORTABLE), 'party_id'),
    lookup: async function (req, res) {
      const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean);
      return ok(res, await parties.lookup(req.query.q, ids));
    },
    detail: async function (req, res) { return ok(res, await parties.detail(req.params.id)); },
    create: async function (req, res) { return ok(res, await parties.create(req.body, req.actor), 'common.created'); },
    update: async function (req, res) { return ok(res, await parties.update(req.params.id, req.body, req.actor), 'common.updated'); },
    setStatus: async function (req, res) {
      return ok(res, await parties.setStatus(req.params.id, req.body.party_status, req.actor), 'common.updated');
    },
    addContact: async function (req, res) {
      return ok(res, await parties.addContact(req.params.id, req.body, req.actor), 'common.created');
    },
    updateContact: async function (req, res) {
      return ok(res, await parties.updateContact(req.params.id, req.params.contactId, req.body, req.actor), 'common.updated');
    },
    linkAccount: async function (req, res) {
      return ok(res, await parties.linkAccount(req.params.id, req.body, req.actor), 'common.created');
    },
    unlinkAccount: async function (req, res) {
      return ok(res, await parties.unlinkAccount(req.params.id, req.params.accountId, req.actor), 'common.updated');
    },
    setConsent: async function (req, res) {
      return ok(res, await parties.setConsent(req.params.id, req.body, req.actor), 'common.updated');
    },
    merge: async function (req, res) {
      return ok(res, await parties.merge(req.params.id, req.body.merged_party_id, req.body.merge_reason, 'MANUAL', req.actor), 'crm.merged');
    },
    duplicates: async function (req, res) {
      const paging = readPaging(req.query, [], 'id');
      return page(res, await parties.pendingCandidates(paging), paging);
    },
    scanDuplicates: async function (req, res) { return ok(res, await parties.scanDuplicates(req.actor)); },
    acceptDuplicate: async function (req, res) {
      return ok(res, await parties.decideCandidate(req.params.id, true, req.actor), 'crm.merged');
    },
    rejectDuplicate: async function (req, res) {
      return ok(res, await parties.decideCandidate(req.params.id, false, req.actor), 'common.updated');
    }
  },

  /* ---- products, registrations, transfers ---- */
  products: {
    instances: lister(products.searchInstances, ['product_instance_id', 'created_at'], 'product_instance_id'),
    instanceLookup: async function (req, res) {
      const paging = readPaging({ limit: 20 }, [], 'product_instance_id');
      return ok(res, (await products.searchInstances(req.query, paging)).rows);
    },
    instance: async function (req, res) { return ok(res, await products.instanceDetail(req.params.id)); },
    updateInstance: async function (req, res) {
      return ok(res, await products.updateInstance(req.params.id, req.body, req.actor), 'common.updated');
    },
    registrations: lister(products.searchRegistrations, ['registered_at', 'valid_from', 'valid_to'], 'registered_at'),
    register: async function (req, res) {
      return ok(res, await products.register(req.body, req.actor), 'common.created');
    },
    endRegistration: async function (req, res) {
      return ok(res, await products.endRegistration(req.params.id, req.body.end_reason_code, req.actor), 'common.updated');
    },
    catalogLookup: async function (req, res) {
      const db = require('../config/db');
      const qb = db('crm_product_catalog as c').join('crm_project as j', 'j.project_id', 'c.project_id')
        .whereNot('c.status', 'DISCONTINUED').orderBy('c.product_name').limit(1000)
        .select('c.product_id', 'c.product_code', 'c.product_name', 'c.product_kind', 'c.project_id', 'j.project_code');
      if (req.query.project_id) qb.where('c.project_id', req.query.project_id);
      return ok(res, await qb);
    },
    transfers: lister(products.searchTransfers, ['requested_at', 'completed_at'], 'requested_at'),
    requestTransfer: async function (req, res) {
      return ok(res, await products.requestTransfer(req.body, req.actor), 'common.created');
    },
    transitionTransfer: async function (req, res) {
      return ok(res, await products.transitionTransfer(req.params.id, req.body.status, req.body.reason, req.actor), 'common.updated');
    }
  },

  /* ---- service cases ---- */
  cases: {
    list: lister(cases.search, ['received_at', 'due_at', 'closed_at'], 'received_at'),
    detail: async function (req, res) { return ok(res, await cases.detail(req.params.id)); },
    create: async function (req, res) { return ok(res, await cases.create(req.body, req.actor), 'common.created'); },
    update: async function (req, res) { return ok(res, await cases.update(req.params.id, req.body, req.actor), 'common.updated'); },
    classify: async function (req, res) {
      return ok(res, await cases.classify(req.params.id, req.body, req.actor), 'common.updated');
    }
  },

  /* ---- points ---- */
  points: {
    accounts: lister(points.searchAccounts, ['balance', 'lifetime_earned', 'last_event_at'], 'balance'),
    events: lister(points.searchEvents, [], 'occurred_at'),
    adjust: async function (req, res) { return ok(res, await points.adjust(req.body, req.actor), 'common.created'); },
    drift: async function (req, res) { return ok(res, await points.drift()); }
  },

  /* ---- activity programs ---- */
  programs: {
    list: lister(programs.search, ['starts_at', 'program_code', 'created_at'], 'created_at'),
    options: async function (req, res) {
      return ok(res, await require('../config/db')('crm_activity_program').orderBy('activity_program_id', 'desc').limit(500)
        .select('activity_program_id', 'program_code', 'program_name', 'status'));
    },
    detail: async function (req, res) { return ok(res, await programs.detail(req.params.id)); },
    create: async function (req, res) { return ok(res, await programs.create(req.body, req.actor), 'common.created'); },
    update: async function (req, res) { return ok(res, await programs.update(req.params.id, req.body, req.actor), 'common.updated'); },
    transition: async function (req, res) {
      return ok(res, await programs.transition(req.params.id, req.body.status, req.actor), 'common.updated');
    },
    saveTier: async function (req, res) {
      return ok(res, await programs.saveTier(req.params.id, req.params.tierId, req.body, req.actor), 'common.updated');
    },
    removeTier: async function (req, res) {
      await programs.removeTier(req.params.id, req.params.tierId, req.actor);
      return ok(res, null, 'common.deleted');
    },
    addLocation: async function (req, res) {
      return ok(res, await programs.addLocation(req.params.id, req.body, req.actor), 'common.created');
    },
    removeLocation: async function (req, res) {
      await programs.removeLocation(req.params.id, req.params.rowId, req.actor);
      return ok(res, null, 'common.deleted');
    },
    saveQuota: async function (req, res) {
      return ok(res, await programs.saveQuota(req.params.id, req.params.quotaId, req.body, req.actor), 'common.updated');
    },
    removeQuota: async function (req, res) {
      await programs.removeQuota(req.params.id, req.params.quotaId, req.actor);
      return ok(res, null, 'common.deleted');
    },
    saveReward: async function (req, res) {
      return ok(res, await programs.saveReward(req.params.id, req.params.rewardId, req.body, req.actor), 'common.updated');
    },
    removeReward: async function (req, res) {
      await programs.removeReward(req.params.id, req.params.rewardId, req.actor);
      return ok(res, null, 'common.deleted');
    },
    targets: scopedLister(programs.searchTargets),
    addTarget: async function (req, res) {
      return ok(res, await programs.addTarget(req.params.id, req.body, req.actor), 'common.created');
    },
    buildTargets: async function (req, res) {
      return ok(res, await programs.buildTargets(req.params.id, req.actor), 'crm.targetsBuilt');
    },
    revokeTarget: async function (req, res) {
      return ok(res, await programs.revokeTarget(req.params.id, req.params.targetId, req.actor), 'common.updated');
    },
    reservations: scopedLister(programs.searchReservations),
    reserve: async function (req, res) {
      return ok(res, await programs.reserve(req.params.id, req.body, req.actor), 'common.created');
    },
    transitionReservation: async function (req, res) {
      return ok(res, await programs.transitionReservation(req.params.reservationId, req.body.status, req.body, req.actor), 'common.updated');
    },
    reservationEvents: async function (req, res) {
      return ok(res, await programs.reservationEvents(req.params.reservationId));
    },
    awards: scopedLister(programs.searchAwards),
    award: async function (req, res) { return ok(res, await programs.award(req.params.id, req.body, req.actor), 'common.created'); },
    transitionAward: async function (req, res) {
      return ok(res, await programs.transitionAward(req.params.awardId, req.body.status, req.body, req.actor), 'common.updated');
    }
  },

  /* ---- sites and what happens at them ---- */
  sites: {
    list: lister(sites.searchSites, ['location_code', 'location_name', 'rating'], 'location_name', 'asc'),
    options: async function (req, res) { return ok(res, await sites.siteOptions()); },
    detail: async function (req, res) { return ok(res, await sites.siteDetail(req.params.id)); },
    create: async function (req, res) { return ok(res, await sites.saveSite(null, req.body, req.actor), 'common.created'); },
    update: async function (req, res) { return ok(res, await sites.saveSite(req.params.id, req.body, req.actor), 'common.updated'); },
    addCapability: async function (req, res) {
      return ok(res, await sites.addCapability(req.params.id, req.body, req.actor), 'common.created');
    },
    endCapability: async function (req, res) {
      return ok(res, await sites.endCapability(req.params.id, req.params.capabilityId, req.actor), 'common.updated');
    },
    activities: lister(sites.searchActivities, [], 'occurred_at'),
    recordActivity: async function (req, res) {
      return ok(res, await sites.recordActivity(req.body, req.actor), 'common.created');
    },
    reverseActivity: async function (req, res) {
      return ok(res, await sites.reverseActivity(req.params.id, req.body.note, req.actor), 'common.updated');
    },
    events: lister(sites.searchEvents, [], 'planned_start_at'),
    createEvent: async function (req, res) { return ok(res, await sites.saveEvent(null, req.body, req.actor), 'common.created'); },
    updateEvent: async function (req, res) {
      return ok(res, await sites.saveEvent(req.params.id, req.body, req.actor), 'common.updated');
    },
    targets: lister(sites.searchTargets, [], 'period_start'),
    createTarget: async function (req, res) { return ok(res, await sites.saveTarget(null, req.body, req.actor), 'common.created'); },
    updateTarget: async function (req, res) {
      return ok(res, await sites.saveTarget(req.params.id, req.body, req.actor), 'common.updated');
    },
    removeTarget: async function (req, res) {
      await sites.removeTarget(req.params.id, req.actor);
      return ok(res, null, 'common.deleted');
    }
  },

  /* ---- segments and campaigns ---- */
  segments: {
    list: lister(marketing.searchSegments, [], 'segment_id'),
    options: async function (req, res) { return ok(res, await marketing.segmentOptions()); },
    fields: async function (req, res) { return ok(res, marketing.fields()); },
    preview: async function (req, res) { return ok(res, await marketing.preview(req.body)); },
    detail: async function (req, res) { return ok(res, await marketing.segmentDetail(req.params.id)); },
    members: scopedLister(marketing.segmentMembers),
    create: async function (req, res) { return ok(res, await marketing.createSegment(req.body, req.actor), 'common.created'); },
    update: async function (req, res) {
      return ok(res, await marketing.updateSegment(req.params.id, req.body, req.actor), 'common.updated');
    },
    newVersion: async function (req, res) {
      return ok(res, await marketing.newVersion(req.params.id, req.body, req.actor), 'common.created');
    },
    evaluate: async function (req, res) {
      return ok(res, await marketing.evaluate(req.params.id, req.actor), 'crm.evaluated');
    }
  },

  campaigns: {
    list: lister(marketing.searchCampaigns, [], 'campaign_id'),
    options: async function (req, res) { return ok(res, await marketing.campaignOptions()); },
    detail: async function (req, res) { return ok(res, await marketing.campaignDetail(req.params.id)); },
    create: async function (req, res) { return ok(res, await marketing.saveCampaign(null, req.body, req.actor), 'common.created'); },
    update: async function (req, res) {
      return ok(res, await marketing.saveCampaign(req.params.id, req.body, req.actor), 'common.updated');
    },
    transition: async function (req, res) {
      return ok(res, await marketing.transitionCampaign(req.params.id, req.body.status, req.actor), 'common.updated');
    },
    addAudience: async function (req, res) {
      return ok(res, await marketing.addAudience(req.params.id, req.body, req.actor), 'common.created');
    },
    createAction: async function (req, res) {
      return ok(res, await marketing.saveAction(req.params.id, null, req.body, req.actor), 'common.created');
    },
    updateAction: async function (req, res) {
      return ok(res, await marketing.saveAction(req.params.id, req.params.actionId, req.body, req.actor), 'common.updated');
    },
    prepareAction: async function (req, res) {
      return ok(res, await marketing.prepareAction(req.params.id, req.params.actionId, req.actor), 'crm.prepared');
    },
    setActionStatus: async function (req, res) {
      return ok(res, await marketing.setActionStatus(req.params.id, req.params.actionId, req.body.status, req.actor), 'common.updated');
    },
    recipients: async function (req, res) {
      const paging = readPaging(req.query, [], 'id');
      return page(res, await marketing.recipients(req.params.id, req.params.actionId, req.query, paging), paging);
    },
    addCost: async function (req, res) {
      return ok(res, await marketing.addCost(req.params.id, req.body, req.actor), 'common.created');
    },
    removeCost: async function (req, res) {
      await marketing.removeCost(req.params.id, req.params.costId, req.actor);
      return ok(res, null, 'common.deleted');
    }
  }
};
