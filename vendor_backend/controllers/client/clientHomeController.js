const moment = require('moment');
const { validationResult } = require('express-validator');
const MessageModel = require('../../models/messageModel');
const AdModel = require('../../models/advertiseModel');
const UserModel = require('../../models/userModel');
const ExpModel = require('../../models/experienceModel');
const SurveyModel = require('../../models/surveyModel');
const AppModel = require('../../models/appModel');
const PointModel = require('../../models/pointModel');
const ProductModel = require('../../models/productModel');
const BlogModel = require('../../models/blogModel');
const BaseModel = require('../../models/baseModel');
const AgencyModel = require('../../models/agencyModel');
const ManagerModel = require('../../models/managerModel');
const ReserveModel = require('../../models/reserveModel');
const PremiumModel = require('../../models/premiumModel');
const DeviceModel = require('../../models/deviceModel');
const WeatherModel = require('../../models/weatherModel');
const { createResponse } = require('../../utils/response');
const { getFileSize, getDayDiff } = require('../../utils/utils');
const RESP_CODES = require('../../constants/responseCodes');
const { DEFAULT_PAGE_SIZE, NOTIFICATION_STATUS, FLAG_EXIST, APP_UPDATE_TYPE, DUTY_ACTION, POINT_TYPE_VALUES, SYNC_STATUS, MANAGER_ROLE_PAGE_SUFFIX, MANAGER_ROLES, FLAG_ACTIVE, PHONE_TYPE } = require('../../constants/constants');
const { getWeatherInfo } = require('../common/commonWeatherController');

async function fetchHomeCommonInfo(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const is_check_update = +req.query.is_check_update || 0;
    const app_version_code = +req.query.app_version_code || 0;
    const app_last_time = req.query.app_last_time || "";
    const imei = req.query.imei || "";
    let tester;
    if (imei) {
      tester = await AppModel.findActiveTester(imei);
    }
    if (is_check_update === 1) {
      if (tester) {
        const test_row = await AppModel.findTestUpdates(app_version_code, app_last_time);
        if (test_row) {
          const fileSize = getFileSize(test_row.file_url);
          if (fileSize > 0) {
            const data = {
              update_row: {
                ...test_row,
                file_size: fileSize,
              }
            };
            return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
          }
        }
      }

      const update_rows = await AppModel.findActiveUpdates(app_version_code, app_last_time);
      if (update_rows.length > 0) {
        const apk_updates = update_rows.filter(row => row.type === APP_UPDATE_TYPE.APK);
        if (apk_updates.length > 0) {
          const info = apk_updates[0];
          const fileSize = getFileSize(info.file_url);
          if (fileSize > 0) {
            const data = {
              update_row: {
                ...info,
                file_size: fileSize,
              }
            };
            return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
          }
        }
        const patch_updates = update_rows.filter(row => row.type === APP_UPDATE_TYPE.PATCH);
        if (patch_updates.length > 0) {
          const info = patch_updates[0];
          const fileSize = getFileSize(info.file_url);
          if (fileSize > 0) {
            const data = {
              update_row: {
                ...info,
                file_size: fileSize,
              }
            };
            return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
          }
        }
      }
    }

    const patch_row = await AppModel.findDbFileTime(tester ? APP_UPDATE_TYPE.TEST : APP_UPDATE_TYPE.PATCH, app_version_code);
    const db_file_time = patch_row ? patch_row.db_file_time : "";

    const notification_offset = +req.query.notification_offset || 0;
    const notification_limit = +req.query.notification_limit || DEFAULT_PAGE_SIZE;
    const notification_min_at = req.query.notification_min_at || "";
    const notification_max_at = req.query.notification_max_at || "";
    const notification_sort = { key: "position", dir: "asc" };
    let notification_filter = { offset: notification_offset, limit: notification_limit, sort: notification_sort, min_at: notification_min_at, max_at: notification_max_at, is_client: 1 };
    if (notification_min_at === "" && notification_max_at === "") {
      notification_filter = { ...notification_filter, is_deleted: FLAG_EXIST, status: NOTIFICATION_STATUS.SHOW, is_now: 1 };
    }
    const notification_rows = await MessageModel.findNotifications(notification_filter, false);

    const popup_offset = +req.query.popup_offset || 0;
    const popup_limit = +req.query.popup_limit || DEFAULT_PAGE_SIZE;
    const popup_min_at = req.query.popup_min_at || "";
    const popup_max_at = req.query.popup_max_at || "";
    const popup_sort = { key: "position", dir: "asc" };
    let popup_filter = { offset: popup_offset, limit: popup_limit, sort: popup_sort, min_at: popup_min_at, max_at: popup_max_at, is_client: 1 };
    if (popup_min_at === "" && popup_max_at === "") {
      popup_filter = { ...popup_filter, is_deleted: FLAG_EXIST, is_now: 1 };
    }
    const popup_rows = await AdModel.findHomePopups(popup_filter, false);

    const faq_offset = +req.query.faq_offset || 0;
    const faq_limit = +req.query.faq_limit || DEFAULT_PAGE_SIZE;
    const faq_min_at = req.query.faq_min_at || "";
    const faq_max_at = req.query.faq_max_at || "";
    const faq_sort = { key: "position", dir: "asc" };
    let faq_filter = { offset: faq_offset, limit: faq_limit, sort: faq_sort, min_at: faq_min_at, max_at: faq_max_at, is_client: 1 };
    if (faq_min_at === "" && faq_max_at === "") {
      faq_filter = { ...faq_filter, is_deleted: FLAG_EXIST };
    }
    const faq_rows = await MessageModel.findAllFaqs(faq_filter, false);

    const home_sort = { key: "position", dir: "asc" };
    const home_last_at = req.query.home_last_at || "";
    const home_filter = { offset: 0, limit: 0, sort: home_sort, is_deleted: FLAG_EXIST, last_at: home_last_at, is_client: 1, is_test: 0 };
    const home_rows = await AdModel.findHomeConfigs(home_filter, false);
    const layout_pks = home_rows.map(row => row.layout_pk);
    const ad_rows = await AdModel.findLayoutAdsByLayoutPks(layout_pks, 1);

    const page_banner_offset = +req.query.page_banner_offset || 0;
    const page_banner_limit = +req.query.page_banner_limit;
    const page_banner_min_at = req.query.page_banner_min_at || "";
    const page_banner_max_at = req.query.page_banner_max_at || "";
    const page_banner_sort = { key: "position", dir: "asc" };
    let page_banner_filter = { offset: page_banner_offset, limit: page_banner_limit, sort: page_banner_sort, min_at: page_banner_min_at, max_at: page_banner_max_at, status: SYNC_STATUS.APPROVED, is_client: 1 };
    if (page_banner_min_at === "" && page_banner_max_at === "") {
      page_banner_filter = { ...page_banner_filter, is_deleted: FLAG_EXIST };
    }
    const page_banner_rows = await AdModel.findPageBanners(page_banner_filter, false);

    const duty_offset = +req.query.duty_offset || 0;
    const duty_limit = +req.query.duty_limit;
    const duty_min_at = req.query.duty_min_at || "";
    const duty_max_at = req.query.duty_max_at || "";
    const duty_sort = { key: "position", dir: "asc" };
    let duty_filter = { offset: duty_offset, limit: duty_limit, sort: duty_sort, min_at: duty_min_at, max_at: duty_max_at, is_client: 1 };
    if (duty_min_at === "" && duty_max_at === "") {
      duty_filter = { ...duty_filter, is_deleted: FLAG_EXIST, is_now: 1 };
    }
    const duty_rows = await ExpModel.findDuties(duty_filter, false);

    const survey_question_offset = +req.query.survey_question_offset || 0;
    const survey_question_limit = +req.query.survey_question_limit;
    const survey_question_min_at = req.query.survey_question_min_at || "";
    const survey_question_max_at = req.query.survey_question_max_at || "";
    let survey_question_filter = { offset: survey_question_offset, limit: survey_question_limit, min_at: survey_question_min_at, max_at: survey_question_max_at, is_client: 1 };
    if (survey_question_min_at === "" && survey_question_max_at === "") {
      survey_question_filter = { ...survey_question_filter, is_deleted: FLAG_EXIST, is_now: 1 };
    }
    const survey_question_rows = await SurveyModel.findQuestionsWithSurveys(survey_question_filter, false);

    const survey_choice_rows = await SurveyModel.findChoicesForNow();

    const menu_offset = +req.query.menu_offset || 0;
    const menu_limit = +req.query.menu_limit || DEFAULT_PAGE_SIZE;
    const menu_sort = { key: "position", dir: "asc" };
    const menu_min_at = req.query.menu_min_at || "";
    const menu_max_at = req.query.menu_max_at || "";
    let menu_filter = { offset: menu_offset, limit: menu_limit, sort: menu_sort, min_at: menu_min_at, max_at: menu_max_at, is_client: 1, include_test: tester ? 1 : 0 };
    if (menu_min_at === "" && menu_max_at === "") {
      menu_filter = { ...menu_filter, is_deleted: FLAG_EXIST };
    }
    const menu_rows = await AdModel.findHomeMenus(menu_filter, false);

    const product_category_offset = +req.query.product_category_offset || 0;
    const product_category_limit = +req.query.product_category_limit;
    const product_category_min_at = req.query.product_category_min_at || "";
    const product_category_max_at = req.query.product_category_max_at || "";
    let product_category_filter = { offset: product_category_offset, limit: product_category_limit, sort: {}, min_at: product_category_min_at, max_at: product_category_max_at, is_client: 1 };
    if (product_category_min_at === "" && product_category_max_at === "") {
      product_category_filter = { ...product_category_filter, is_deleted: FLAG_EXIST };
    }
    const product_category_rows = await ProductModel.findCategories(product_category_filter, false);

    const product_offset = +req.query.product_offset || 0;
    const product_limit = +req.query.product_limit;
    const product_min_at = req.query.product_min_at || "";
    const product_max_at = req.query.product_max_at || "";
    let product_filter = { offset: product_offset, limit: product_limit, sort: {}, min_at: product_min_at, max_at: product_max_at, is_client: 1 };
    if (product_min_at === "" && product_max_at === "") {
      product_filter = { ...product_filter, is_deleted: FLAG_EXIST };
    }
    const product_rows = await ProductModel.findAllProducts(product_filter, false);

    const product_image_offset = +req.query.product_image_offset || 0;
    const product_image_limit = +req.query.product_image_limit;
    const product_image_min_at = req.query.product_image_min_at || "";
    const product_image_max_at = req.query.product_image_max_at || "";
    let product_image_filter = { offset: product_image_offset, limit: product_image_limit, sort: {}, min_at: product_image_min_at, max_at: product_image_max_at, is_client: 1 };
    if (product_image_min_at === "" && product_image_max_at === "") {
      product_image_filter = { ...product_image_filter, is_deleted: FLAG_EXIST };
    }
    const product_image_rows = await ProductModel.findProductImages(product_image_filter, false);

    const spec_key_offset = +req.query.spec_key_offset || 0;
    const spec_key_limit = +req.query.spec_key_limit;
    const spec_key_min_at = req.query.spec_key_min_at || "";
    const spec_key_max_at = req.query.spec_key_max_at || "";
    let spec_key_filter = { offset: spec_key_offset, limit: spec_key_limit, sort: {}, min_at: spec_key_min_at, max_at: spec_key_max_at, is_client: 1 };
    if (spec_key_min_at === "" && spec_key_max_at === "") {
      spec_key_filter = { ...spec_key_filter, is_deleted: FLAG_EXIST };
    }
    const spec_key_rows = await ProductModel.findSpecKeys(spec_key_filter, false);

    const spec_order_offset = +req.query.spec_order_offset || 0;
    const spec_order_limit = +req.query.spec_order_limit;
    const spec_order_sort = {};
    const spec_order_min_at = req.query.spec_order_min_at || "";
    const spec_order_max_at = req.query.spec_order_max_at || "";
    let spec_order_filter = { offset: spec_order_offset, limit: spec_order_limit, sort: spec_order_sort, min_at: spec_order_min_at, max_at: spec_order_max_at, is_client: 1 };
    if (spec_order_min_at === "" && spec_order_max_at === "") {
      spec_order_filter = { ...spec_order_filter, is_deleted: FLAG_EXIST };
    }
    const spec_order_rows = await ProductModel.findSpecOrders(spec_order_filter, false);

    const spec_value_offset = +req.query.spec_value_offset || 0;
    const spec_value_limit = +req.query.spec_value_limit;
    const spec_value_min_at = req.query.spec_value_min_at || "";
    const spec_value_max_at = req.query.spec_value_max_at || "";
    let spec_value_filter = { offset: spec_value_offset, limit: spec_value_limit, sort: {}, min_at: spec_value_min_at, max_at: spec_value_max_at, is_client: 1 };
    if (spec_value_min_at === "" && spec_value_max_at === "") {
      spec_value_filter = { ...spec_value_filter, is_deleted: FLAG_EXIST };
    }
    const spec_value_rows = await ProductModel.findSpecValues(spec_value_filter, false);

    const product_model_offset = +req.query.product_model_offset || 0;
    const product_model_limit = +req.query.product_model_limit;
    const product_model_min_at = req.query.product_model_min_at || "";
    const product_model_max_at = req.query.product_model_max_at || "";
    let product_model_filter = { offset: product_model_offset, limit: product_model_limit, sort: {}, min_at: product_model_min_at, max_at: product_model_max_at, is_client: 1 };
    if (product_model_min_at === "" && product_model_max_at === "") {
      product_model_filter = { ...product_model_filter, is_deleted: FLAG_EXIST };
    }
    const product_model_rows = await ProductModel.findProductModels(product_model_filter, false);

    const blog_subject_offset = +req.query.blog_subject_offset || 0;
    const blog_subject_limit = +req.query.blog_subject_limit;
    const blog_subject_sort = { key: "order_no", dir: "asc" };
    const blog_subject_min_at = req.query.blog_subject_min_at || "";
    const blog_subject_max_at = req.query.blog_subject_max_at || "";
    let blog_subject_filter = { offset: blog_subject_offset, limit: blog_subject_limit, sort: blog_subject_sort, min_at: blog_subject_min_at, max_at: blog_subject_max_at, is_client: 1 };
    if (blog_subject_min_at === "" && blog_subject_max_at === "") {
      blog_subject_filter = { ...blog_subject_filter, is_deleted: FLAG_EXIST };
    }
    const blog_subject_rows = await BlogModel.findSubjects(blog_subject_filter, false);

    const company_contact_offset = +req.query.company_contact_offset || 0;
    const company_contact_limit = +req.query.company_contact_limit;
    const company_contact_sort = { key: "position", dir: "asc" };
    const company_contact_min_at = req.query.company_contact_min_at || "";
    const company_contact_max_at = req.query.company_contact_max_at || "";
    let company_contact_filter = { offset: company_contact_offset, limit: company_contact_limit, sort: company_contact_sort, min_at: company_contact_min_at, max_at: company_contact_max_at, is_client: 1 };
    if (company_contact_min_at === "" && company_contact_max_at === "") {
      company_contact_filter = { ...company_contact_filter, is_deleted: FLAG_EXIST };
    }
    const company_contact_rows = await BaseModel.findCompanyContacts(company_contact_filter, false);

    const phone_sale_agency_offset = +req.query.phone_sale_agency_offset || 0;
    const phone_sale_agency_limit = +req.query.phone_sale_agency_limit;
    const phone_sale_agency_sort = { key: "position", dir: "asc" };
    const phone_sale_agency_min_at = req.query.phone_sale_agency_min_at || "";
    const phone_sale_agency_max_at = req.query.phone_sale_agency_max_at || "";
    let phone_sale_agency_filter = { offset: phone_sale_agency_offset, limit: phone_sale_agency_limit, sort: phone_sale_agency_sort, min_at: phone_sale_agency_min_at, max_at: phone_sale_agency_max_at, is_client: 1 };
    if (phone_sale_agency_min_at === "" && phone_sale_agency_max_at === "") {
      phone_sale_agency_filter = { ...phone_sale_agency_filter, status: FLAG_ACTIVE };
    }
    const phone_sale_agency_rows = await AgencyModel.findPhoneSaleAgencies(phone_sale_agency_filter, false);

    const premium_service_offset = +req.query.premium_service_offset || 0;
    const premium_service_limit = +req.query.premium_service_limit;
    const premium_service_sort = { key: "lottery_start_date", dir: "asc" };
    const premium_service_min_at = req.query.premium_service_min_at || "";
    const premium_service_max_at = req.query.premium_service_max_at || "";
    let premium_service_filter = { offset: premium_service_offset, limit: premium_service_limit, sort: premium_service_sort, min_at: premium_service_min_at, max_at: premium_service_max_at, is_client: 1, include_test: tester ? 1 : 0 };
    if (premium_service_min_at === "" && premium_service_max_at === "") {
      premium_service_filter = { ...premium_service_filter, is_deleted: FLAG_EXIST };
    }
    const premium_service_rows = await PremiumModel.findPremiumServices(premium_service_filter, false);

    const int_class_offset = +req.query.int_class_offset || 0;
    const int_class_limit = +req.query.int_class_limit;
    const int_class_sort = { key: "class_level", dir: "asc" };
    const int_class_min_at = req.query.int_class_min_at || "";
    const int_class_max_at = req.query.int_class_max_at || "";
    let int_class_filter = { offset: int_class_offset, limit: int_class_limit, sort: int_class_sort, min_at: int_class_min_at, max_at: int_class_max_at };
    if (int_class_min_at === "" && int_class_max_at === "") {
      int_class_filter = { ...int_class_filter, is_deleted: FLAG_EXIST };
    }
    const int_class_rows = await PremiumModel.findIntegratedUserClasses(int_class_filter, false);

    const weather_stations_offset = +req.query.weather_stations_offset || 0;
    const weather_stations_limit = +req.query.weather_stations_limit;
    const weather_stations_sort = { key: "area_code", dir: "asc" };
    const weather_stations_min_at = req.query.weather_stations_min_at || "";
    const weather_stations_max_at = req.query.weather_stations_max_at || "";
    let weather_stations_filter = { offset: weather_stations_offset, limit: weather_stations_limit, sort: weather_stations_sort, min_at: weather_stations_min_at, max_at: weather_stations_max_at, type: 4 };
    if (weather_stations_min_at === "" && weather_stations_max_at === "") {
      weather_stations_filter = { ...weather_stations_filter, is_deleted: FLAG_EXIST };
    }
    const weather_station_rows = await WeatherModel.findWeatherStations(weather_stations_filter, false);

    const weather_current_station = +req.query.weather_current_station || 0;
    const weather_short_stations = req.query.weather_short_stations;
    const weather_resp = await getWeatherInfo(weather_current_station, weather_short_stations);
    let weather_data = undefined;
    if (weather_resp.code === RESP_CODES.SUCCESS.code) {
      weather_data = weather_resp.data;
    }

    const today = moment().format("YYYY-MM-DD");

    let data = {
      db_file_time,
      // notification_total,
      notification_rows,
      // popup_total,
      popup_rows,
      // faq_total,
      faq_rows,
      location_rows: [],
      home_rows,
      ad_rows,
      exp_banner_rows: [],
      page_banner_rows,
      // duty_total,
      duty_rows,
      // survey_question_total,
      survey_question_rows,
      survey_choice_rows,
      menu_rows,
      product_category_rows,
      product_rows,
      product_image_rows,
      spec_key_rows,
      spec_order_rows,
      spec_value_rows,
      product_model_rows,
      blog_subject_rows,
      company_contact_rows,
      phone_sale_agency_rows,
      premium_service_rows,
      int_class_rows,
      today,
      is_tester: tester ? 1 : 0,
    };
    // if (tester) {
    data = {
      ...data,
      weather_station_rows,
      weather_current: weather_data ? weather_data.current_weather : undefined,
      weather_shorts: weather_data ? weather_data.short_weathers : undefined,
    };
    // }
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchHomeCommonInfoV2(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const is_check_update = +req.query.is_check_update || 0;
    const app_version_code = +req.query.app_version_code || 0;
    const app_last_time = req.query.app_last_time || "";
    const imei = req.query.imei || "";
    let tester;
    if (imei) {
      tester = await AppModel.findActiveTester(imei);
    }
    if (is_check_update === 1) {
      if (tester) {
        const test_row = await AppModel.findTestUpdates(app_version_code, app_last_time);
        if (test_row) {
          const fileSize = getFileSize(test_row.file_url);
          if (fileSize > 0) {
            const data = {
              update_row: {
                ...test_row,
                file_size: fileSize,
              }
            };
            return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
          }
        }
      }

      const update_rows = await AppModel.findActiveUpdates(app_version_code, app_last_time);
      if (update_rows.length > 0) {
        const apk_updates = update_rows.filter(row => row.type === APP_UPDATE_TYPE.APK);
        if (apk_updates.length > 0) {
          const info = apk_updates[0];
          const fileSize = getFileSize(info.file_url);
          if (fileSize > 0) {
            const data = {
              update_row: {
                ...info,
                file_size: fileSize,
              }
            };
            return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
          }
        }
        const patch_updates = update_rows.filter(row => row.type === APP_UPDATE_TYPE.PATCH);
        if (patch_updates.length > 0) {
          const info = patch_updates[0];
          const fileSize = getFileSize(info.file_url);
          if (fileSize > 0) {
            const data = {
              update_row: {
                ...info,
                file_size: fileSize,
              }
            };
            return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
          }
        }
      }
    }

    const patch_row = await AppModel.findDbFileTime(tester ? APP_UPDATE_TYPE.TEST : APP_UPDATE_TYPE.PATCH, app_version_code);
    const db_file_time = patch_row ? patch_row.db_file_time : "";

    const notification_limit = +req.query.notification_limit || DEFAULT_PAGE_SIZE;
    const notification_min_at = req.query.notification_min_at || "";
    const notification_max_at = req.query.notification_max_at || "";
    const notification_sort = { key: "position", dir: "asc" };
    let notification_filter = { offset: 0, limit: notification_limit, sort: notification_sort, min_at: notification_min_at, max_at: notification_max_at, is_client: 1 };
    if (notification_min_at === "" && notification_max_at === "") {
      notification_filter = { ...notification_filter, is_deleted: FLAG_EXIST, status: NOTIFICATION_STATUS.SHOW, is_now: 1 };
    }
    const notification_rows = await MessageModel.findNotifications(notification_filter, false);

    const popup_max_at = req.query.popup_max_at || "";
    const popup_sort = { key: "position", dir: "asc" };
    let popup_filter = { offset: 0, limit: 0, sort: popup_sort, max_at: popup_max_at, is_client: 1 };
    if (popup_max_at === "") {
      popup_filter = { ...popup_filter, is_deleted: FLAG_EXIST, is_now: 1 };
    }
    const popup_rows = await AdModel.findHomePopups(popup_filter, false);

    const home_sort = { key: "position", dir: "asc" };
    const home_filter = { offset: 0, limit: 0, sort: home_sort, is_deleted: FLAG_EXIST, is_client: 1, is_test: 0 };
    const home_rows = await AdModel.findHomeConfigs(home_filter, false);
    const layout_pks = home_rows.map(row => row.layout_pk);
    const ad_rows = await AdModel.findLayoutAdsByLayoutPks(layout_pks, 1);

    const page_banner_max_at = req.query.page_banner_max_at || "";
    const page_banner_sort = { key: "position", dir: "asc" };
    let page_banner_filter = { offset: 0, limit: 0, sort: page_banner_sort, max_at: page_banner_max_at, status: SYNC_STATUS.APPROVED, is_client: 1 };
    if (page_banner_max_at === "") {
      page_banner_filter = { ...page_banner_filter, is_deleted: FLAG_EXIST };
    }
    const page_banner_rows = await AdModel.findPageBanners(page_banner_filter, false);

    const duty_max_at = req.query.duty_max_at || "";
    const duty_sort = { key: "position", dir: "asc" };
    let duty_filter = { offset: 0, limit: 0, sort: duty_sort, max_at: duty_max_at, is_client: 1 };
    if (duty_max_at === "") {
      duty_filter = { ...duty_filter, is_deleted: FLAG_EXIST };
    }
    const duty_rows = await ExpModel.findDuties(duty_filter, false);

    const survey_question_max_at = req.query.survey_question_max_at || "";
    let survey_question_filter = { offset: 0, limit: 0, max_at: survey_question_max_at, is_client: 1 };
    if (survey_question_max_at === "") {
      survey_question_filter = { ...survey_question_filter, is_deleted: FLAG_EXIST, is_now: 1 };
    }
    const survey_question_rows = await SurveyModel.findQuestionsWithSurveys(survey_question_filter, false);

    const survey_choice_rows = await SurveyModel.findChoicesForNow();

    const menu_sort = { key: "position", dir: "asc" };
    const menu_max_at = req.query.menu_max_at || "";
    let menu_filter = { offset: 0, limit: 0, sort: menu_sort, max_at: menu_max_at, is_client: 1, include_test: tester ? 1 : 0 };
    if (menu_max_at === "") {
      menu_filter = { ...menu_filter, is_deleted: FLAG_EXIST };
    }
    const menu_rows = await AdModel.findHomeMenus(menu_filter, false);

    const product_max_at = req.query.product_max_at || "";
    let product_filter = { offset: 0, limit: 0, sort: {}, max_at: product_max_at, is_client: 1 };
    if (product_max_at === "") {
      product_filter = { ...product_filter, is_deleted: FLAG_EXIST };
    }
    const product_rows = await ProductModel.findAllProducts(product_filter, false);

    const product_image_max_at = req.query.product_image_max_at || "";
    let product_image_filter = { offset: 0, limit: 0, sort: {}, max_at: product_image_max_at, is_client: 1 };
    if (product_image_max_at === "") {
      product_image_filter = { ...product_image_filter, is_deleted: FLAG_EXIST };
    }
    const product_image_rows = await ProductModel.findProductImages(product_image_filter, false);

    const spec_key_max_at = req.query.spec_key_max_at || "";
    let spec_key_filter = { offset: 0, limit: 0, sort: {}, max_at: spec_key_max_at, is_client: 1 };
    if (spec_key_max_at === "") {
      spec_key_filter = { ...spec_key_filter, is_deleted: FLAG_EXIST };
    }
    const spec_key_rows = await ProductModel.findSpecKeys(spec_key_filter, false);

    const spec_order_max_at = req.query.spec_order_max_at || "";
    let spec_order_filter = { offset: 0, limit: 0, sort: {}, max_at: spec_order_max_at, is_client: 1 };
    if (spec_order_max_at === "") {
      spec_order_filter = { ...spec_order_filter, is_deleted: FLAG_EXIST };
    }
    const spec_order_rows = await ProductModel.findSpecOrders(spec_order_filter, false);

    const spec_value_max_at = req.query.spec_value_max_at || "";
    let spec_value_filter = { offset: 0, limit: 0, sort: {}, max_at: spec_value_max_at, is_client: 1 };
    if (spec_value_max_at === "") {
      spec_value_filter = { ...spec_value_filter, is_deleted: FLAG_EXIST };
    }
    const spec_value_rows = await ProductModel.findSpecValues(spec_value_filter, false);

    const product_model_max_at = req.query.product_model_max_at || "";
    let product_model_filter = { offset: 0, limit: 0, sort: {}, max_at: product_model_max_at, is_client: 1 };
    if (product_model_max_at === "") {
      product_model_filter = { ...product_model_filter, is_deleted: FLAG_EXIST };
    }
    const product_model_rows = await ProductModel.findProductModels(product_model_filter, false);

    const premium_service_sort = { key: "lottery_start_date", dir: "asc" };
    const premium_service_max_at = req.query.premium_service_max_at || "";
    let premium_service_filter = { offset: 0, limit: 0, sort: premium_service_sort, max_at: premium_service_max_at, is_client: 1, include_test: tester ? 1 : 0 };
    if (premium_service_max_at === "") {
      premium_service_filter = { ...premium_service_filter, is_deleted: FLAG_EXIST };
    }
    const premium_service_rows = await PremiumModel.findPremiumServices(premium_service_filter, false);

    const int_class_sort = { key: "class_level", dir: "asc" };
    const int_class_max_at = req.query.int_class_max_at || "";
    let int_class_filter = { offset: 0, limit: 0, sort: int_class_sort, max_at: int_class_max_at };
    if (int_class_max_at === "") {
      int_class_filter = { ...int_class_filter, is_deleted: FLAG_EXIST };
    }
    const int_class_rows = await PremiumModel.findIntegratedUserClasses(int_class_filter, false);

    const weather_stations_sort = { key: "area_code", dir: "asc" };
    const weather_stations_max_at = req.query.weather_stations_max_at || "";
    let weather_stations_filter = { offset: 0, limit: 0, sort: weather_stations_sort, max_at: weather_stations_max_at, type: 4 };
    if (weather_stations_max_at === "") {
      weather_stations_filter = { ...weather_stations_filter, is_deleted: FLAG_EXIST };
    }
    const weather_station_rows = await WeatherModel.findWeatherStations(weather_stations_filter, false);

    const weather_current_station = +req.query.weather_current_station || 0;
    const weather_short_stations = req.query.weather_short_stations;
    const weather_resp = await getWeatherInfo(weather_current_station, weather_short_stations);
    let weather_data = undefined;
    if (weather_resp.code === RESP_CODES.SUCCESS.code) {
      weather_data = weather_resp.data;
    }

    const today = moment().format("YYYY-MM-DD");

    let data = {
      db_file_time,
      notification_rows,
      popup_rows,
      location_rows: [],
      home_rows,
      ad_rows,
      exp_banner_rows: [],
      page_banner_rows,
      duty_rows,
      survey_question_rows,
      survey_choice_rows,
      menu_rows,
      product_rows,
      product_image_rows,
      spec_key_rows,
      spec_order_rows,
      spec_value_rows,
      product_model_rows,
      premium_service_rows,
      int_class_rows,
      weather_station_rows,
      weather_current: weather_data ? weather_data.current_weather : undefined,
      weather_shorts: weather_data ? weather_data.short_weathers : undefined,
      today,
      is_tester: tester ? 1 : 0,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchCompanyContacts(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const min_at = req.query.min_at || "";
    const max_at = req.query.max_at || "";
    let company_contact_filter = { offset: 0, limit: 0, sort: {}, min_at, max_at, is_client: 1 };
    if (min_at === "" && max_at === "") {
      company_contact_filter = { ...company_contact_filter, is_deleted: FLAG_EXIST };
    }
    const rows = await BaseModel.findCompanyContacts(company_contact_filter, false);

    const data = {
      rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchHomeUserInfo(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const user_detail = await UserModel.findUserAllInfoByPk(user.user_pk);
    const phoneFilter = {
      user_pk: user.user_pk,
      phone_type: PHONE_TYPE.USER,
    };
    const user_phone_numbers = await UserModel.findUserPhonesByFilter(phoneFilter);
    const phone_numbers = user_phone_numbers ? user_phone_numbers.map(item => item.phone_number).join(", ") : "";

    // check role
    let department = "";
    let feedback_permission = MANAGER_ROLES.NONE;
    let survey_permission = MANAGER_ROLES.NONE;
    let agency_phone_permission = MANAGER_ROLES.NONE;
    let agency_eprod_permission = MANAGER_ROLES.NONE;
    const admin = await ManagerModel.findUserAdminByUserPk(user.user_pk);
    if (admin) {
      if (admin.department && admin.department.split("").some(item => item === '1')) {
        department = admin.department;
      }
      const feedbackPermRow = await ManagerModel.findRoleByPageSuffix(admin.role_pk, MANAGER_ROLE_PAGE_SUFFIX.FEEDBACK_THREAD);
      if (feedbackPermRow) {
        feedback_permission = feedbackPermRow.permission;
      }
      const surveyPermRow = await ManagerModel.findRoleByPageSuffix(admin.role_pk, MANAGER_ROLE_PAGE_SUFFIX.SURVEY_GROUP);
      if (surveyPermRow) {
        survey_permission = surveyPermRow.permission;
      }
      const agencyPhonePermRow = await ManagerModel.findRoleByPageSuffix(admin.role_pk, MANAGER_ROLE_PAGE_SUFFIX.AGENCY_PHONE);
      if (agencyPhonePermRow) {
        agency_phone_permission = agencyPhonePermRow.permission;
      }
      const agencyEprodPermRow = await ManagerModel.findRoleByPageSuffix(admin.role_pk, MANAGER_ROLE_PAGE_SUFFIX.AGENCY_EPROD);
      if (agencyEprodPermRow) {
        agency_eprod_permission = agencyEprodPermRow.permission;
      }
    }

    const broadcast_offset = +req.query.broadcast_offset || 0;
    const broadcast_limit = +req.query.broadcast_limit || 0;
    const broadcast_min_at = req.query.broadcast_min_at || "";
    const broadcast_max_at = req.query.broadcast_max_at || "";
    const broadcast_sort = { key: "created_at", dir: "desc" };
    let broadcast_filter = { offset: broadcast_offset, limit: broadcast_limit, sort: broadcast_sort, user_pk: user.user_pk, min_at: broadcast_min_at, max_at: broadcast_max_at, is_client: 1 };
    if (broadcast_min_at === "" && broadcast_max_at === "") {
      broadcast_filter = { ...broadcast_filter, is_deleted: FLAG_EXIST };
    }
    const broadcast_rows = await MessageModel.findBroadcastsByUserPk(broadcast_filter, false);

    const feedback_thread_offset = +req.query.feedback_thread_offset || 0;
    const feedback_thread_limit = +req.query.feedback_thread_limit || 0;
    const feedback_thread_min_at = req.query.feedback_thread_min_at || "";
    const feedback_thread_max_at = req.query.feedback_thread_max_at || "";
    const feedback_thread_sort = { key: "updated_at", dir: "desc" };
    let feedback_thread_filter = { offset: feedback_thread_offset, limit: feedback_thread_limit, sort: feedback_thread_sort, user_pk: user.user_pk, min_at: feedback_thread_min_at, max_at: feedback_thread_max_at, is_client: 1 };
    if (feedback_thread_min_at === "" && feedback_thread_max_at === "") {
      feedback_thread_filter = { ...feedback_thread_filter, is_deleted: FLAG_EXIST };
    }
    const feedback_thread_rows = await MessageModel.findFeedbackThreads(feedback_thread_filter, false);

    const achieve_filter = { offset: 0, limit: 0, sort: {}, user_pk: user.user_pk, is_now: 1, is_client: 1 };
    const achieve_rows = await ExpModel.findAchievements(achieve_filter, false);

    const nextDailyPointType = await getNextDailyPointType(user.user_pk);
    if (nextDailyPointType.code !== RESP_CODES.SUCCESS.code) {
      return res.status(nextDailyPointType.code).json(nextDailyPointType);
    }
    const next_daily_login_point = nextDailyPointType.data;

    const survey_response_rows = await SurveyModel.findResponsesForNow(user.user_pk);

    const reg_phone_offset = +req.query.reg_phone_offset || 0;
    const reg_phone_limit = +req.query.reg_phone_limit || 0;
    const reg_phone_min_at = req.query.reg_phone_min_at || "";
    const reg_phone_max_at = req.query.reg_phone_max_at || "";
    const reg_phone_sort = { key: "updated_at", dir: "desc" };
    const reg_phone_filter = { offset: reg_phone_offset, limit: reg_phone_limit, sort: reg_phone_sort, user_pk: user.user_pk, min_at: reg_phone_min_at, max_at: reg_phone_max_at, is_client: 1 };
    const reg_phone_rows = await ProductModel.findRegisterPhoneLog(reg_phone_filter, false);

    const cid_dev_offset = +req.query.cid_dev_offset || 0;
    const cid_dev_limit = +req.query.cid_dev_limit || 0;
    const cid_dev_min_at = req.query.cid_dev_min_at || "";
    const cid_dev_max_at = req.query.cid_dev_max_at || "";
    const cid_dev_sort = { key: "last_logged_in", dir: "desc" };
    const cid_dev_filter = { offset: cid_dev_offset, limit: cid_dev_limit, sort: cid_dev_sort, user_pk: user.user_pk, min_at: cid_dev_min_at, max_at: cid_dev_max_at };
    const cid_dev_rows = await DeviceModel.findCidDevices(cid_dev_filter, false);

    const reservable_count = await ReserveModel.findReservableCountTodayByUserPk(user.user_pk);

    const data = {
      user_detail: { ...user_detail, phone_numbers, department, manager_pk: admin ? admin.manager_pk : 0, feedback_permission, survey_permission, agency_phone_permission, agency_eprod_permission },
      broadcast_rows,
      feedback_thread_rows,
      achieve_rows,
      next_daily_login_point,
      survey_response_rows,
      reg_phone_rows,
      cid_dev_rows,
      reservable_count,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchHomeUserInfoV2(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const user_detail = await UserModel.findUserAllInfoByPk(user.user_pk);
    const phoneFilter = {
      user_pk: user.user_pk,
      phone_type: PHONE_TYPE.USER,
    };
    const user_phone_numbers = await UserModel.findUserPhonesByFilter(phoneFilter);
    const phone_numbers = user_phone_numbers ? user_phone_numbers.map(item => item.phone_number).join(", ") : "";

    // check role
    let department = "";
    let feedback_permission = MANAGER_ROLES.NONE;
    let survey_permission = MANAGER_ROLES.NONE;
    let agency_phone_permission = MANAGER_ROLES.NONE;
    let agency_eprod_permission = MANAGER_ROLES.NONE;
    const admin = await ManagerModel.findUserAdminByUserPk(user.user_pk);
    if (admin) {
      if (admin.department && admin.department.split("").some(item => item === '1')) {
        department = admin.department;
      }
      const feedbackPermRow = await ManagerModel.findRoleByPageSuffix(admin.role_pk, MANAGER_ROLE_PAGE_SUFFIX.FEEDBACK_THREAD);
      if (feedbackPermRow) {
        feedback_permission = feedbackPermRow.permission;
      }
      const surveyPermRow = await ManagerModel.findRoleByPageSuffix(admin.role_pk, MANAGER_ROLE_PAGE_SUFFIX.SURVEY_GROUP);
      if (surveyPermRow) {
        survey_permission = surveyPermRow.permission;
      }
      const agencyPhonePermRow = await ManagerModel.findRoleByPageSuffix(admin.role_pk, MANAGER_ROLE_PAGE_SUFFIX.AGENCY_PHONE);
      if (agencyPhonePermRow) {
        agency_phone_permission = agencyPhonePermRow.permission;
      }
      const agencyEprodPermRow = await ManagerModel.findRoleByPageSuffix(admin.role_pk, MANAGER_ROLE_PAGE_SUFFIX.AGENCY_EPROD);
      if (agencyEprodPermRow) {
        agency_eprod_permission = agencyEprodPermRow.permission;
      }
    }

    const broadcast_min_at = req.query.broadcast_min_at || "";
    const broadcast_max_at = req.query.broadcast_max_at || "";
    const broadcast_sort = { key: "created_at", dir: "desc" };
    let broadcast_filter = { offset: 0, limit: 0, sort: broadcast_sort, user_pk: user.user_pk, min_at: broadcast_min_at, max_at: broadcast_max_at, is_client: 1 };
    if (broadcast_min_at === "" && broadcast_max_at === "") {
      broadcast_filter = { ...broadcast_filter, is_deleted: FLAG_EXIST };
    }
    const broadcast_rows = await MessageModel.findBroadcastsByUserPk(broadcast_filter, false);

    const feedback_thread_min_at = req.query.feedback_thread_min_at || "";
    const feedback_thread_max_at = req.query.feedback_thread_max_at || "";
    const feedback_thread_sort = { key: "updated_at", dir: "desc" };
    let feedback_thread_filter = { offset: 0, limit: 0, sort: feedback_thread_sort, user_pk: user.user_pk, min_at: feedback_thread_min_at, max_at: feedback_thread_max_at, is_client: 1 };
    if (feedback_thread_min_at === "" && feedback_thread_max_at === "") {
      feedback_thread_filter = { ...feedback_thread_filter, is_deleted: FLAG_EXIST };
    }
    const feedback_thread_rows = await MessageModel.findFeedbackThreads(feedback_thread_filter, false);

    const achieve_filter = { offset: 0, limit: 0, sort: {}, user_pk: user.user_pk, is_now: 1, is_client: 1 };
    const achieve_rows = await ExpModel.findAchievements(achieve_filter, false);

    const nextDailyPointType = await getNextDailyPointType(user.user_pk);
    if (nextDailyPointType.code !== RESP_CODES.SUCCESS.code) {
      return res.status(nextDailyPointType.code).json(nextDailyPointType);
    }
    const next_daily_login_point = nextDailyPointType.data;

    const survey_response_rows = await SurveyModel.findResponsesForNow(user.user_pk);

    const reg_phone_max_at = req.query.reg_phone_max_at || "";
    const reg_phone_sort = { key: "updated_at", dir: "desc" };
    const reg_phone_filter = { offset: 0, limit: 0, sort: reg_phone_sort, user_pk: user.user_pk, max_at: reg_phone_max_at, is_client: 1 };
    const reg_phone_rows = await ProductModel.findRegisterPhoneLog(reg_phone_filter, false);

    const cid_dev_offset = +req.query.cid_dev_offset || 0;
    const cid_dev_limit = +req.query.cid_dev_limit || 0;
    const cid_dev_min_at = req.query.cid_dev_min_at || "";
    const cid_dev_max_at = req.query.cid_dev_max_at || "";
    const cid_dev_sort = { key: "last_logged_in", dir: "desc" };
    const cid_dev_filter = { offset: cid_dev_offset, limit: cid_dev_limit, sort: cid_dev_sort, user_pk: user.user_pk, min_at: cid_dev_min_at, max_at: cid_dev_max_at };
    const cid_dev_rows = await DeviceModel.findCidDevices(cid_dev_filter, false);

    const reservable_count = await ReserveModel.findReservableCountTodayByUserPk(user.user_pk);

    const data = {
      user_detail: { ...user_detail, phone_numbers, department, manager_pk: admin ? admin.manager_pk : 0, feedback_permission, survey_permission, agency_phone_permission, agency_eprod_permission },
      broadcast_rows,
      feedback_thread_rows,
      achieve_rows,
      next_daily_login_point,
      survey_response_rows,
      reg_phone_rows,
      cid_dev_rows,
      reservable_count,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function getNextDailyPointType(user_pk) {
  try {
    const duty = await ExpModel.findActiveDutyByAction(DUTY_ACTION.EVERY_LOGIN);
    const lastAchieve = await ExpModel.findLastAchievement({ user_pk, duty_pk: duty.duty_pk });
    let newTypePk = POINT_TYPE_VALUES.MOBILE_DAILY_LOGIN_FIRST;
    if (lastAchieve) {
      const today = moment().format("YYYY-MM-DD");
      const last = lastAchieve.action_at;
      if (today === last) {
        newTypePk = lastAchieve.point_type;
      } else if (getDayDiff(today, last) === 1) {
        newTypePk = lastAchieve.point_type === POINT_TYPE_VALUES.MOBILE_DAILY_LOGIN_LAST ? POINT_TYPE_VALUES.MOBILE_DAILY_LOGIN_LAST : lastAchieve.point_type + 1;
      }
    }

    const data = await PointModel.findActivityPointTypeByPk(newTypePk);
    if (!data) {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }

    return createResponse(RESP_CODES.SUCCESS, data);
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

module.exports = {
  fetchHomeCommonInfo,
  fetchHomeCommonInfoV2,
  fetchCompanyContacts,
  fetchHomeUserInfo,
  fetchHomeUserInfoV2,
};
