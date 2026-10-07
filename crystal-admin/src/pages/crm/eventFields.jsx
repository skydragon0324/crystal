import { useEffect, useState } from 'react';
import { crm } from '../../api';
import { choices, optionsFrom, useCatalogOptions, useCrmMeta } from './shared';

const TYPES = ['RESERVATION', 'LOTTERY', 'PRIZE_SERVICE', 'PUZZLE', 'SURVEY_REWARD', 'EVENT_ATTENDANCE'];
const BASES = ['MANUAL', 'SEGMENT', 'POINT_RANKING', 'CORPORATE_GRADE', 'PRODUCT_REGISTRATION', 'SERVICE_CENTER_ACTIVITY', 'IMPORT', 'OPEN'];

/**
 * THE EVENT FORM, for the new-event dialog and the edit on the event
 * itself.
 *
 * `full` is false once an event has been approved: from then on only what a
 * participant reads may change - the description, when it is shown, how long
 * collection runs. Who may take part, what it costs and how entries are
 * numbered are what the approver signed off, so they are not offered.
 */
export function useEventFields(full) {
  const meta = useCrmMeta();
  const catalog = useCatalogOptions();
  const [segments, setSegments] = useState([]);

  useEffect(() => {
    let live = true;
    crm.segments.options()
      .then(({ data }) => { if (live) setSegments(Array.isArray(data) ? data : []); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const always = [
    { name: 'description', label: 'Description', type: 'textarea', colSpan: 'full' },
    { name: 'summary', label: 'One-line summary', colSpan: 'full' },
    { name: 'display_at', label: 'Shown from', type: 'datetime-local' },
    { name: 'fulfilment_ends_at', label: 'Collection ends', type: 'datetime-local' },
    { name: 'is_private', label: 'Only targets can see it', type: 'checkbox' }
  ];

  if (!full) return always;

  return [
    { type: 'section', label: 'The event' },
    { name: 'event_code', label: 'Code', required: true },
    { name: 'event_name', label: 'Event', required: true },
    { name: 'event_type', label: 'Type', type: 'select', required: true, isClearable: false, options: choices(TYPES) },
    { name: 'project_id', label: 'Project', type: 'select', options: optionsFrom(meta.projects, 'project_id', 'project_name') },
    { name: 'approval_no', label: 'Approval number' },
    { name: 'reserved_product_id', label: 'Product being reserved', type: 'select', options: catalog, isSearchable: true },

    { type: 'section', label: 'Who may take part' },
    { name: 'eligibility_basis', label: 'Chosen by', type: 'select', required: true, isClearable: false, options: choices(BASES),
      help: 'By hand and Import are filled on the Targets tab. Open lets anybody take part.' },
    { name: 'eligibility_segment_id', label: 'Segment', type: 'select',
      options: segments.map((segment) => ({ value: segment.segment_id, label: segment.segment_name })) },
    { name: 'ranking_point_type_id', label: 'Ranked by points of type', type: 'select',
      options: optionsFrom(meta.point_types, 'point_type_id', 'point_type_name') },
    { name: 'ranking_cutoff_at', label: 'Points counted until', type: 'datetime-local' },
    { name: 'ranking_top_n', label: 'Top how many', type: 'number' },
    { name: 'eligibility_rule', label: 'Rule details (JSON)', type: 'textarea', colSpan: 'full',
      help: 'For a grade: {"min_grade_rank": 2}. For owners: {"product_class_code": "PHONE_9"}. For site visits: {"activity_code": "CUSTOMER_VISIT", "since_days": 90}.' },

    { type: 'section', label: 'Entries' },
    { name: 'cost_point_type_id', label: 'Costs points of type', type: 'select',
      options: optionsFrom(meta.point_types, 'point_type_id', 'point_type_name') },
    { name: 'cost_points', label: 'Points per entry', type: 'number', step: '0.001' },
    { name: 'number_prefix', label: 'Number prefix' },
    { name: 'number_suffix', label: 'Number suffix' },
    { name: 'number_start', label: 'First number', type: 'number' },
    { name: 'number_end', label: 'Last number', type: 'number' },
    { name: 'starts_at', label: 'Opens', type: 'datetime-local' },
    { name: 'ends_at', label: 'Closes', type: 'datetime-local' },
    { name: 'is_test', label: 'Test event', type: 'checkbox' },

    { type: 'section', label: 'What participants read' }
  ].concat(always);
}

export default useEventFields;
