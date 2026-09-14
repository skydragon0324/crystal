const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const messageController = require('../../controllers/client/clientMessageController');
const { validateEditBroadcast, validateEditFeedbackThread, validateFetchFeedbackMessages, validateLevelFeedbackMessage } = require('../../middleware/clientMessageValidators');
const { validateAddFeedbackMessage } = require('../../middleware/commonMessageValidators');

router.get('/notifications', messageController.fetchNotifications);
router.get('/faqs', messageController.fetchFaqs);
router.get('/broadcasts', authController.verifyUserToken, messageController.fetchBroadcasts);
router.post('/broadcast_edit', authController.verifyUserToken, validateEditBroadcast, messageController.editBroadcast);
router.get('/feedback_threads', authController.verifyUserToken, messageController.fetchFeedbackThreads);
router.post('/feedback_thread_edit', authController.verifyUserToken, validateEditFeedbackThread, messageController.editFeedbackThread);
router.get('/feedback_messages', authController.verifyUserToken, validateFetchFeedbackMessages, messageController.fetchFeedbackMessages);
router.post('/feedback_message_add', authController.verifyUserToken, validateAddFeedbackMessage, messageController.addFeedbackMessage);
router.get('/feedback_admin_threads', authController.verifyUserToken, messageController.fetchFeedbackAdminThreads);
router.post('/feedback_admin_thread_edit', authController.verifyUserToken, validateEditFeedbackThread, messageController.editFeedbackAdminThread);
router.post('/feedback_admin_thread_reset_session', authController.verifyUserToken, messageController.resetFeedbackAdminThreadSession);
router.get('/feedback_admin_messages', authController.verifyUserToken, validateFetchFeedbackMessages, messageController.fetchFeedbackAdminMessages);
router.post('/feedback_admin_message_add', authController.verifyUserToken, validateAddFeedbackMessage, messageController.addFeedbackAdminMessage);
router.post('/feedback_admin_message_level', authController.verifyUserToken, validateLevelFeedbackMessage, messageController.levelFeedbackAdminMessage);
router.get('/feedback_admin_replies', authController.verifyUserToken, messageController.fetchFeedbackReplies);

module.exports = router;
