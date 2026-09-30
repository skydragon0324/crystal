/**
 * Kept as the import path the pages already use.
 *
 * This used to wrap react-date-picker, which brought its own stylesheet
 * and was themed through a global .custom-date-picker class - so it never
 * followed the colour mode and drifted every time the palette moved. It
 * now forwards to components/Picker/DatePicker, which is built from
 * Horizon tokens.
 *
 * The contract is unchanged - a Date in, a Date (or "" when cleared) out -
 * so no page needed editing. Import DatePicker directly in new code.
 */
export { default } from './DatePicker';
