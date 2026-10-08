const db = require('../../config/db');
const audit = require('../audit.service');
const { HttpError } = require('../../utils/response');

/**
 * INTERNAL DEPARTMENTS - design section 3.2 / 4.
 *
 * A department says WHERE an employee works; their ROLE says what they may
 * do. A finance clerk and a finance manager share the Finance department and
 * hold different roles, so the department grants nothing by itself - the
 * console's permission grid (roles x pages) stays the only authority.
 *
 * What the department adds is a guard on assignment: a role can be marked as
 * meant for one department, and this screen refuses to hand it to somebody
 * in another. The console's managers and roles tables are untouched - the
 * department of a manager and the department of a role are CRM link tables.
 */

const PAGE = '/admin/crm/settings';

/** Every manager with their role and department - the staff list. */
function staff() {
  return db('managers as manager')
    .join('manager_roles as manager_role', 'manager_role.id', 'manager.role_id')
    .leftJoin('crm_manager_department as md', 'md.manager_id', 'manager.id')
    .leftJoin('crm_department as department', 'department.department_id', 'md.department_id')
    .leftJoin('crm_role_department as rd', 'rd.role_id', 'manager_role.id')
    .leftJoin('crm_department as rdd', 'rdd.department_id', 'rd.department_id')
    .where('manager.is_deleted', false)
    .orderBy('manager.name')
    .select('manager.id as manager_id', 'manager.username', 'manager.name', 'manager.status', 'manager_role.id as role_id', 'manager_role.role_code', 'manager_role.role_name',
      'department.department_id', 'department.department_code', 'department.department_name',
      'rd.department_id as role_department_id', 'rdd.department_name as role_department_name');
}

function roles() {
  return db('manager_roles as manager_role')
    .leftJoin('crm_role_department as rd', 'rd.role_id', 'manager_role.id')
    .leftJoin('crm_department as department', 'department.department_id', 'rd.department_id')
    .orderBy('manager_role.role_name')
    .select('manager_role.id as role_id', 'manager_role.role_code', 'manager_role.role_name', 'department.department_id', 'department.department_name',
      db.raw('(SELECT COUNT(*) FROM managers manager WHERE manager.role_id = manager_role.id)::int AS manager_cnt'));
}

/**
 * Put a manager in a department. Refused when their current role is meant for
 * a different department - move the role or the person, not both silently.
 */
async function assignManager(managerId, departmentId, actor) {
  const manager = await db('managers').where('id', managerId).first('id', 'role_id');
  if (!manager) throw new HttpError(404, 'common.notFound');

  if (departmentId) {
    const meant = await db('crm_role_department').where('role_id', manager.role_id).first('department_id');
    if (meant && String(meant.department_id) !== String(departmentId)) throw new HttpError(409, 'crm.settings.thatRoleIsForAnotherDepartment');
    await db.raw(`
      INSERT INTO crm_manager_department (manager_id, department_id, assigned_by_manager_id) VALUES (?, ?, ?)
      ON CONFLICT (manager_id) DO UPDATE SET department_id = EXCLUDED.department_id,
        assigned_at = now(), assigned_by_manager_id = EXCLUDED.assigned_by_manager_id`,
    [managerId, departmentId, actor.manager_id]);
  } else {
    await db('crm_manager_department').where('manager_id', managerId).del();
  }

  audit.updated(actor, 'crm_manager_department', managerId, null, { department_id: departmentId || null }, PAGE);
  return { manager_id: Number(managerId), department_id: departmentId || null };
}

/** Mark the department a role is meant for, or clear it. */
async function setRoleDepartment(roleId, departmentId, actor) {
  const role = await db('manager_roles').where('id', roleId).first('id');
  if (!role) throw new HttpError(404, 'common.notFound');

  if (departmentId) {
    await db.raw(`
      INSERT INTO crm_role_department (role_id, department_id) VALUES (?, ?)
      ON CONFLICT (role_id) DO UPDATE SET department_id = EXCLUDED.department_id`, [roleId, departmentId]);
  } else {
    await db('crm_role_department').where('role_id', roleId).del();
  }

  audit.updated(actor, 'crm_role_department', roleId, null, { department_id: departmentId || null }, PAGE);
  return { role_id: Number(roleId), department_id: departmentId || null };
}

module.exports = { staff: staff, roles: roles, assignManager: assignManager, setRoleDepartment: setRoleDepartment };
