------------------ 10 / 2 -----------------------
let's make some changes on DB 
first, on crm_person table,  change job_title as int, and make job list table and link it
no need nationality_code, preferred_language, id_card_hash
id_card_masked to is_checked_manually as boolean
and manager can review every person manullay, once reviewed, we make it as reviewed - is_check_manually as true
not sure why we need id_card_hash on crm_person table
second, on crm_organization table, it is missing location 

to start this CRM, I will start by adding some real users, who have all personal info - name, location, phone-number, gender, birthday, job title
I will add these users with Excel, so there should be a function to upload excel file
if I upload the file, it extract data from the file and add users to crm_person
while adding them, need to create crm_party as well
but before adding a row in crm_person, we need to check then if any similar user already exists
I will provide you the logic later
also, please make sample excel file

even though admin add a user, we need to check duplication logic


--------------------------------------------------------------
there is no function to validate when adding or editing something
please check location table on vendor project, and replace crm_location table with it
what are the tables crm_location_xxx?
what are the programs on my projects?
why did you add programs?
I already mentioned that I have only one program for each project
so, we don't need to add programs into project

please explain how to find identity_match_candidates
----------------------
you are still using one-letter variable
don't use one-letter variable, please use meaning variable for all variables in this project
on your crm_service_location, location_name and location_kind means service center?
or real location of service center?
your naming rule is not good enough, on DB, names related location is not clear

and we have importing excel feature on customers page
on your sample excel file's fields are not correct
location is a not varchar - will be location_id and job title as well
which table is to manage phone numbers of each customer?
----------------------
one customer can have multiple phone numbers
how would you like to handle this case?
including several phone numbers with comma in one field?
or make a new table to manage phone numbers for each customer?
which one is better to manage them especially?
also, which one is better for search engine?
also, in case handling several phone numbers in one table,  "123456, 234566" and "234566, 123456" should be the same

--------------------------------------------
let's add party_pk on crm_party, this will be used to identify a customer
on internal system, there is no problem using interger, but on the website, usign integer like "customer/17" is not good practice
so, I would replace current party_id as party_pk
party_pk will be bigint value, and party_id will be varchar
we will use this party_id in other tables
so, please replace party_id field as varchar in other tables
----------------------------------
for CRM feature, please review the project and develop this project using established software engineering best practices.

Before implementing features:

1. Review the existing project structure, technology stack, and dependencies.
2. Identify architectural problems, technical risks, and missing requirements.
3. Propose a clear and maintainable architecture before making major changes.
4. Follow the existing conventions unless there is a clear reason to change them.

Development requirements:

* Use modular, maintainable, and readable code.
* Separate presentation, business logic, API handling, and data access.
* Avoid unnecessary duplication, overly complex functions, and premature abstraction.
* Validate all untrusted inputs and enforce authorization on the server.
* Keep secrets and environment-specific configuration out of source code.
* Use database migrations and appropriate database constraints.
* Handle errors consistently and log useful diagnostic information without exposing sensitive data.
* Write appropriate unit, integration, and end-to-end tests.
* Document APIs, architecture decisions, environment variables, and setup instructions.
* Consider performance, accessibility, reliability, and security.
* Avoid introducing dependencies without a clear benefit.
* Do not rewrite working code unnecessarily.
* Do not claim that a feature or test works unless it has been verified.

For each feature:

1. Explain the proposed approach briefly.
2. Identify the files and modules that need to change.
3. Implement the smallest complete solution.
4. Review the changes for security, regressions, and maintainability.
When an architectural decision has significant trade-offs, explain the options and recommend an approach based on the project's actual requirements.

don't change if it is not related to CRM, since one else is working on other features
I don't want to make any conflicts
---------------------------
in our phase 1, we won't use party_id, instead we will use party_pk as foreign key
so, please update party_id as party_pk in other tables
When importing data from Excel, the system must perform a duplicate check within the dataset itself to avoid adding the same user multiple times.
Additionally, when adding records to the `crm_party` table, the system must check for duplicates against existing users and prevent the addition of any duplicates.
The duplicate check logic is as follows:
Same phone number: +40
Same name: +25
Same date of birth: +25
Same home address: +15
Same occupation: +5

If the score is 70 or higher, they can be considered the same person and merged.
If the score is between 40 and 69, an administrator should review and decide whether to merge them.
If the score is 40 or lower, they should be considered different people.

Therefore, the logic flow should be as follows:
If the score is 40 or lower, a new "party" record should be created.
However, if there are matches with a score between 40 and 69, a new party record should *not* be created immediately; instead, the data should be stored in a temporary database for an administrator to review and decide whether to merge or register them as new.
Users newly registered in sub-projects must also undergo this process based on the matching logic.
Once a record is merged or newly registered, the resulting `party_id` must be sent to the relevant department so it can be stored with that user's record.
Regarding the assignment of e-shop identifiers, it is currently difficult to confirm their accuracy with certainty.
Therefore, existing e-shop identifiers should be stored as candidates, allowing an administrator to finalize the assignment.
The system needs to enable administrators to perform these operations on the "Customers" page.
There is currently a "Possible Duplicates" tab, but it needs to be refined and subdivided into more specific categories.
Currently, the process involves creating a party record first and then identifying similar users to place in this tab... If a user with similar characteristics appears, the system should not create a party; instead, it should store the data in a temporary area for processing by an administrator.
--------------------- 10/5 -----------------------------
I’d like to modify the "Choose File" button used for Excel imports; the current default style looks unappealing. Please design the UI to match the file upload feature found in the "Notes and Tabs" section of the user details view.
In the user details view, where various category-specific records are displayed, I would like to add a scrollbar.
Setting a fixed size for these detail windows and enabling scrolling when there is a large volume of records would make the interface much more user-friendly.
Additionally, please include search and filter functions for these records so that users can easily search and filter data specific to that user.
---------------------------------------------------
In the "Snapshots" section, each row displays a user's grade and their activity history over the past 12 months.
Currently, there are separate views for individual projects and an overall view; it would be better to consolidate these into a collapsible format.
At present, expanding a row reveals the user's scores; instead, expanding it should display project-specific data, while the row itself should show the overall information.
-----------------------------------------
The product registration feature includes a user search function that allows only registered users to be added; searching must be possible using the user's name or phone number.
When displaying the list of search results, each user's details—specifically `party_pk`, name, home address, and phone number—must be shown on a single line, separated by commas.
Since a single user may have multiple phone numbers, these numbers must also be displayed separated by commas.
The administrator selects the correct user to input the data.
Once a user is selected, their name appears in the search bar, and the user list is hidden.
It must be possible to change the search term in case of an input error; changing the term should trigger a new search and redisplay the user list in the specified format.
As this user search function has numerous applications, it should be well-modularized and designed for reusability.
-------------------------------
`party_id` is the user identifier, while `party_pk` is the primary key for the user identifier; specifically, `party_id` is of type `varchar` and `party_pk` is of type `int`.
On the user details page, it is more accurate to display `party_pk` rather than `party_id`.
On the "Group details" page, under the "Contacts" tab, a new contact is added via the "Link contact" function, and a role can be selected during this process.
However, after the contact is added, how do roles such as CEO, Nurse, IT Manager, or Sales Manager appear beneath the user's name?
These roles differ from the one selected during the initial addition.
----------------------------------------
let me check it later
Why is it impossible to modify or delete records in the crm_projects table?
There are no external tables currently referencing it, so why has modification been disabled?
Regarding the project: I tried changing the project type from "Platform" to "CRM," but I received an error message stating, "the code 'Platform' is used by the system and cannot be changed or deleted."
I also attempted the change directly in the database and encountered this error: "new row for relation 'crm_project' violates check constraint 'crm_project_project_type_code_check'."
Furthermore, why are project_type_code and source_system_code required? Wouldn't it suffice to have just project_id, project_name, project_code, created_at, and updated_at?
Regarding the next issue: as I mentioned previously, there is only one program per project—meaning the project itself represents the business system, and there are no individual sub-projects within it.
Therefore, there is no need to store "program" information separately.
By any chance, does the "program" you designed for this CRM refer to a software store?
-------------------------------------------
You removed `party_id` from crm_person
we need to save it, but, we won't use it in phase 1

1. Why use Crystal for customer aggregation, and why use Platform for account-related tasks?

2. [schema.sql (row 2800)](D:/sky/crystal/crystal-backend/sql/schema.sql:2800) allows only the following values:

PLATFORM, COMMERCE, SERVICE, SOFTWARE, CONTENT

CRM is not allowed. This check constraint operates independently of foreign keys or the application's protected code rules.

There are two separate restrictions here, and “program” has a different meaning in the current code.

To remove the limitation, we can add, update, or delete projects by admin.

3. “program” means a customer activity: a reservation event, lottery, prize service, puzzle, survey reward, or attendance event. It manages participants, quotas, entries, and awards.

We already have an activity management system called “campaign,” so why should we adopt “program”? I think you created a "program" to store and manage user activity history across various business systems, but if that is the intended meaning, the term "program" is not appropriate.
-----------------------------------------------
I plan to first add only those users for whom we have complete data (name, gender, date of birth, home address, phone number) and those who already have identifiers in the e-shop system.
Therefore, for the Excel import process, I intend to import `eshop_pk` and `eshop_id` instead of just the email address.
This means the import template needs to be changed, and the corresponding processing logic must be updated accordingly.
Also, since the identifiers from the departmental systems linked to existing users cannot be considered 100% accurate, we should not directly commit the data to `crm_project_account`. Instead, store it as temporary data and display it to indicate that the user previously had this information in those departmental systems. This allows an administrator—when handling a user information inquiry requiring manual review—to verify the user's identity by referencing the previously linked identifiers.
This specific functionality is required only when importing user data via Excel.
For data arriving from departmental systems via API calls, the system should perform a duplicate check, then either link the data to an existing record or create a new one, while also attaching the relevant departmental user PK or ID.
You can view this as a feature intended for the initial launch of the project.
I briefly mentioned this before, but I am not sure if the feature was actually implemented.
Please check the status carefully; if it hasn't been implemented or was implemented incorrectly, please make the necessary corrections.
Additionally, please verify whether the API has been designed to allow user registration from the departmental systems.
When a user lookup request comes in from a departmental system, the system must perform a duplicate check. Based on the logic, it should either link the request to a user already registered in the CRM or create a new user record, and then add the relevant data to `project_account`.
---------------------------------------------------------------------------
Please change "program" to "event."

Also, does this mean an API accessible from external projects hasn't been created yet?
I misspoke earlier; the `party_id` should be added to `crm_party`, not `crm_person`.
So, please remove it from `crm_person` and add it to `crm_party`.
Of course, we won't be using this `party_id` in Phase 1.
We'll use `party_pk` to link with other tables.
And why are you making it impossible to modify the project?
The current data is purely for testing purposes; if we are to add actual data, we need to be able to modify or delete it.
Making modification or deletion impossible is completely wrong.
Of course, once the tables are populated and a project's code or ID is already being used in other tables, modification should be restricted. However, since we are currently in the initial stage, we need to be able to modify and delete records.
If such operations are impossible—or if checking whether a project's code is used in other tables requires too much effort—then I would rather delete the existing data entirely.
But right now, we can't even delete or modify the existing data in the database, can we?
How are we supposed to add actual data?

------------------------- 10 / 7 ------------------------------------
Where and when is the "grade" field added on the Customers page?
Is there no feature to assign a grade on the customer details page?
If not, please add it.
Also, regarding the filter options: when selecting from dropdowns, if you click one dropdown but don't make a selection and then click another, the previously clicked dropdown should collapse while the new one expands. Currently, however, the new dropdown opens while the old one remains expanded, which creates a poor UI/UX experience.
This issue occurs not only on the Customers page but across all pages.
Please investigate and fix these issues.

Also, please check if admin can update or delete projects on crm_project table

On customer details page, there is a feature that shows Previously linked identifiers
manager can also link or reject that old account on details page
and on service or orders tab, when I click one row to show details, it directs to transactions page or service case pages and open modal to show the details
I don't think this is good UX design, 
when I click one row, it shows a modal in the same page

what is Log interaction for?

on project accounts table, please change account_id as account_pk and login to account_id

also, on orders and service tab, there is no search option
---------------------------------------------------------------
please rewrite crm-logic.md and crm-database.md file
it would be better to show databases as tables
if it is difficult to make it as table on md file, please make doc file
-----------------------------------
When a row is clicked in the "Orders" or "Service" tabs, detailed information is displayed on the current page via a modal.
However, this functionality has not been implemented for the "Product" tab.
Similarly, this feature is missing when clicking a row in the "Overview" section.
In the "Notes" tab, clicking a row under "Recent Activity" currently navigates to the transaction or a separate page to show the details; this needs to be modified so that the modal appears on the same page instead.

Another issue arises when the modal closes: the background screen shifts position.
For instance, when viewing details from the "Orders" tab and closing the modal, the orders page shifts to the right, centering the order list.
This behavior is unnecessary and should be removed.

Additionally, the "Recent Activity" list in the "Notes" tab currently extends vertically as items accumulate; it would be better to set a fixed height and implement scrolling if the content exceeds that limit.

I am also unclear about the purpose of the `crm_project_api_key` table.
Did you design this database structure because you were asked to design an API that allows user lookups across the relevant systems?
The requirement was simply to create and distribute an API for those systems; I do not understand why this specific table was created.
-----------------------------------------------
In the detail modal for both "pending registrations" and "resolved registrations," phone numbers are currently being displayed as duplicates.

Additionally, regarding the "pending registrations" tab: when a row is selected to open the modal and the list of candidates is extensive, scrolling is currently implemented for the entire modal; however, the header and footer should remain fixed, with scrolling applied only to the candidate list within the modal.

During duplicate checks, if the name and date of birth match but the phone numbers differ, merging the records (performed by an administrator) must result in a single user profile that retains both phone numbers.
Furthermore, if the two accounts being merged have different `eshop_pk` or `eshop_id` values, these values ​​must also be added to the user's record of previous e-shop accounts.
In other words, a single `party_pk` may be associated with two or more `eshop_pk` and `eshop_id` values.
------------------------------------------------
The `address_text` field was originally added to facilitate searching; however, when viewing user details, both the address derived from `location_id` and the `address_text` are currently displayed. Consequently, if `address_text` exists, the same address is shown redundantly.
When importing data from Excel, a `location_id` is included, yet the system uses the address field—rather than this ID—to check for duplicates.
The duplicate check should be performed using the `location_id`.
Additionally, the import process currently uses a hardcoded value of "crystal" for the `origin_project_id`; instead, the system should either allow the inclusion of the origin project name or ID in the Excel file or enable the administrator to select the value during the import process.
In short, using a hardcoded value in the code is fundamentally incorrect.
-------------------------------------------------
When importing data from Excel, the `user_pk` and `user_id` from the user management system must also be included.
Like the e-shop identifiers, these should not be added directly to `project_account` but instead displayed in a candidate list.
Please update the Excel template to include fields for `user_pk` and `user_id`;
the email field can be removed.
Also, the system performs a file check during the import process; encountering errors at this stage should not prevent the addition of valid data.
Rows with errors should be displayed in a separate tab, while valid new users should still be eligible for addition.
In other words, no data should be saved to the database until the "Add New Users" button is clicked; instead, data should be displayed in tabs on the frontend. Upon clicking the button, new users should be added with newly generated `party_pk` values, while entries requiring administrator review and those with errors should be stored separately.
Furthermore, after the file check, the interface should display the data across tabs labeled "New Customers," "Review Customers," and "Errors," allowing users to identify exactly which entries caused errors before proceeding with the addition.
----------------------------------------------------------------------
when importing data from excel, why do you create party_id
we have party_id fields on crm_party table, but on phase 1, we won't use that party_id
I want to add another condition to the duplicate check logic when importing Excel data.
Since a single user can have multiple phone numbers, they currently appear as separate rows in the Excel file.
Therefore, I want to automatically merge records for users who share the same basic information but have different phone numbers; when merging, all the phone numbers need to be included.

in the last session, we updated the excel, adding user_id and user_pk, and you already updated crm_customers_sample.xlsx file, 
but, you haven't updated downloaded template excel file
when I download template, it still doesn't have user_pk and user_id fields,

If manual verification is required, when the corresponding row is opened, you must display all basic information about the user, as well as the project name and identifier (ID, pk) based on the incoming path.

Similarly, for duplicate candidate information, you must display the project name, the IDs associated with the projects, and candidate IDs (only users imported via Excel possess these candidate IDs) along with the basic information.
-------------------------------------------------------------------------------
what is source record in pending registrations tab on customers page?
now, we only have search option on all customers tab on customers page, please add search options on other tabs on customers page
The logic for duplicate detection should be as follows:
Same phone number: +40
Same name: +25
Same date of birth: +25
Same address ID: +15
Same occupation: +5
Score of 70 or higher: Automatic merge
Score of 50–69: Manual review, merge, and registration
Score of 50 or lower: Register as new
Currently, the same user appears as two separate rows during Excel import because they use multiple phone numbers.
Therefore, if the `user_pk` is the same, they should be automatically merged—eliminating the need to manually add a `project_account`—but the two phone numbers must be linked together.
-------------------------------------------------------------------------------
what is location activity? - if you mean "service center's activity, please update it as Service Center's activity

event vs campaign vs program?
please delete all data in the CRM related tables
and let's add new data, first, I will manage basic data including projects list
----------------------------- 10 / 8 --------------------------------------------------
when merge duplicated customers, we need to keep all phone numbers, you still don't store both phone numbers
once admin reviews the duplicated rows and merge to one customer
in that case, if the phone numbers of both customers, we need to keep both phone numbers, not only one
and need to show all phone numbers on customer details page

please check again if it keeps all phone numbers when merging 2 customers and if not implemented yet, please implement it right now
-------------------------------------------------------------------------------
The current translation structure for CRM-related content lacks organization.
All CRM-related phrases have been lumped together under a single "crm:" keyword, and I would like to see this organized properly.
If you look at `C:\sky\crystal_v2\crystal-admin\src\i18n\dictionaries.js`, you can see that phrases are clearly categorized to show exactly where each one is used; however, the current CRM setup links everything to a single term, which is not ideal from a coding perspective.
We should avoid this approach in the future and instead create translations that are clearly organized by page and functional area.
For now, please organize the existing CRM-related phrases.
----------------------------------------------------------------------