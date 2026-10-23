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
When manually reviewing the list of pending registrations, the following scenario may arise:
The name, date of birth, and gender differ, yet the phone number and home address are identical.
In this case, the match score is 55, placing them on the administrator's review list.
However, differing names and dates of birth combined with identical contact details suggest they may be family members.
Naturally, these individuals should be registered as separate customers.
It would be beneficial, however, to add a relationship link between them during this process—such as designating them as a married couple or parent and child—at the same time they are registered.

Another scenario encountered during manual review is as follows:
Currently, a newly arriving user is linked to the `party_pk` of an already registered user.
However, the information for the existing customer may be inaccurate.
Therefore, the system should select the correct details from both the new and existing records to update the customer's information.
In other words, while the existing `party_pk` is retained, the associated data should be updated with the correct information.
To enhance user convenience, the standard approach is to merge the new user into the existing record; if data changes are required, a mechanism (such as specific parameters) should be provided to allow the user to specify the new values.

Additionally, regarding the "Pending Registrations" tab, the system currently displays a list of customers eligible for merging with the new entry; the following layout would likely be more user-friendly:
Display the new customer's information on the left.
Display the list of potential merge candidates on the right. Add a dropdown menu in the upper-right area to select the customer with whom the current record will be merged.
When a registered customer is selected from this list, the system displays only that customer's information on the right side.
This allows the user to intuitively compare the details of both customers and proceed with the merge.
Include a toggle button below that allows the user to choose which customer's data should be used for the update during the merge process.
By default, the toggle is set to "off," using the information from the selected registered customer; however, when switched to "on," the user should be able to specify exactly which customer's data to use for each field—such as name, date of birth, address, occupation, and phone number.
----------------------------------------------
on all customers tab, we are searching by name, party_pk, phone number, birthday in one place
I think we need to separate these searches
with current search field, we should be able to search by party_pk and name
and we need to add other search fields for birthday, location, phone number
so, we can search by name, birthday, phone number, and location at the same time
-------------------------- 10 / 15 ----------------------------------
Let's organize the reward point system.
First, we will create a new table named `crm_reward_points` to manage reward points categorized by business system.
The UI will be structured as follows:
It will display a user's total points at the company level. Expanding the view will reveal details such as the specific business system, the account ID within that system, the points, the weight (assigned via project management), and the resulting points from the company's perspective.
The company-level point total is derived by aggregating these individual scores.
Initially, we will allow administrators to add these entries manually.
In the future, this will be automated through API integration with the relevant departments.
We will disregard specific point-earning mechanics currently in place and focus solely on displaying the total score for each business system.
We will also ignore point movements for the time being.
The system will track only the points associated with a specific business system ID linked to a customer, using these figures to calculate the comprehensive company-level score.
In other words, the company-level score will not be stored directly; instead, it will be dynamically determined based on the scores from individual business systems and their respective weights.
-------------------------------------------------------------------------------------
The logic for importing data from the user management system via Excel has changed.
Phone numbers in the customer list must be unique;
in other words, if a phone number is already linked to one person, it cannot be linked to another.

Under the previous logic, if the phone numbers matched but the names differed, the record would be sent to a "pending registration" queue rather than being registered as new—even if the match score was 50 or higher.
Similarly, if the names differed but the match score was 70 or higher, the record must also go to the pending registration queue.
In short, while a single phone number can correspond to only one person, a single customer can be associated with multiple phone numbers.
This logic must be implemented regardless of whether a new user is registered manually or via API.
That is, when registering a new user, the system must check against existing users; if the phone number matches, the record must be placed in the pending registration queue, whether the match score is 50 or 70+.
---------------------------------------------------------
Regarding the "Accounts" tab: once an account has been separated, it no longer needs to be displayed there.
Once separated, it should be treated as if it no longer exists.
While retaining the history is beneficial, there is no need to show it in the UI.
Additionally, when linking an account within the system, you must check if it is already linked to another user; if it is, you should cancel the link and display an error message.

As for phone numbers, store them in the database without any special characters or symbols.
When displaying them, since they consist of 10 digits, format them using hyphens (e.g., XXX-XXX-XXXX).

When calculating and displaying age, do not factor in whether the birthday has already passed; simply calculate the age based on the difference between the current year and the birth year.
----------------------------------------------------------------------------------
each project can have several kinds of tier - like level, grade, xxx, etc...
so, we need to update crm_membership table so that it has tier_kind
also, we could be able to manage this kind as well
since we might need to add some more kinds for different tier in one project
also, how can I add tier to each customer?
there is no way to add tier manaully, let's add it possible to add tier manually
on customer details page and membership page, we could be able to add tier for each project for each account
----------------------------------------------------------------------------------
on crm_project_account table, let's chanage external_account_id as external_account_pk and external_login as external_account_id
----------------------------------------------------------------------------------
Regarding the `crm_membership` table: instead of adding the `project_account_id` from `crm_project_account` (which would necessitate an extra JOIN operation), please add the `external_account_id` instead.
By adding the `external_account_id` to `crm_membership`, you can avoid the need for additional joins or the inclusion of `party_pk` or `project_id` in that table.
------------------------------------------------------------------------------------
I would like to add a "Membership Summary" section to the "Overview" tab of the customer details page.
A single customer can hold multiple accounts within a system, with each account assigned a different type of membership tier.
For instance, a user named "A" could hold distinct tiers—such as "Level 1" and "Grade 2"—within the online store.
Additional tier types may be introduced as the system evolves.
This information needs to be displayed in the "Membership Summary" section, with further details provided in the "Membership" section of the "Account" tab.
--------------------------------------------------------------------------------------
if you remove project_account_id from crm_membership, we need to have party_pk, how can you find that row is connected with which customer?
so, when you remove project_account_id, we need to keep party_pk and project_id
but, if you want to keep project_account_id, we don't need to keep those party_pk, project_id, external_account_id
since project_account_id is determinded with those data 
-------------------------------
transactions tab, let's not use our DB, I will fill out this page with api to a projects
we already have the api which can get orders list with eshop_pk
we can use this api as well

so, on transactions tab, let's make a new section for eshop transactions
and this section will call the api and get data and show the order list for that customer's eshop_pks,
right now, that api can get order list for one eshop_pk, 
so, on this eshop transaction section, if that customer has more than 2 eshop accounts, let's set one as default and show the order list with that eshop_pk
and if user select another one, we can get data with that another eshop_pk 
if all is selected, we can call the api twice or more and show the orders list with related eshop_pk or eshop_id
------------------------------------------------------
looks good, 
but we need to change something
first, if I select all, it shows account_id field, 
and if I select one of them, it doesn't show that account_id field
 
second, for goods fields, it shows the first good's name of the goods in that transaction, instead of showing the first good's name, let's show the count of goods

third, for currrency, instead of showing Foreign currency or Native currency, let's use our currency system
we already have currency table, 
I chanaged the name as NATIVE and FOREIGN of currencies name
so, let's use currency's code with colors

fourth, on orderslist, the price means total_price, not unit price, 
you are showing qty * price, - this is not correct
price is total price, so change name `paid with`  field with Total price

------------------------------------------------------
on overview tab, why do you still show mock data, please show the list on orders tab
for e-shop orders, we have the selecting eshop_pk part is right-top corner of the table, let's move it to next table title with some spaces
also we need to show all first and then show eshop pks one by one
of course, one of them is selected by default

on orders tab, we need to add more tables for other projects
so, we need to make each table could be collapse and can see other projects orders list
or we might have projects sub tabs under orders tab
so, if I click eshop project, it shows eshop-orders
and if I click eproduct project, it shows eshop-orders
------------------------------------------------------
let's show only the name, without code
and let's show only eshop and smartphone_offline, and appstore

also, on crystal-web page, we already implemented appstore purchase list on this page - account/appstore/purchases 
please check how it works, don't check code right now for appstore orders list
------------------------------------------------------
Now, let's move on to the "Service" tab.
We need to integrate with the "SMARTPHONE_OFFLINE" system to retrieve and display the service history of registered users.
Since this involves integration with the "SMARTPHONE_OFFLINE" system, let's create a temporary table to display the data.
The API format is as follows:
url: "/xxxx"
param: {
master_ids: "s2342523, sd652342, ej234234"
}
The response data format is:
{
items: [
{
master_id: s2342523
customer_name: "adfewerwer"
phone_number:
address:
imei_1:
imei_2
modal_name:
agent_name:
created_at:
updated_at:
reason_name
point:
reason_type_name:
}
]
}
Here, the `master_id`s correspond to the IDs linked to "SMARTPHONE_OFFLINE" in the "Accounts" tab.
The display should be implemented as follows:
The table must include a filtering function that allows users to select individual `account_id`s, similar to the implementation used for e-commerce order lists or product lists.
Please configure the fields as follows:
Map `master_id` to a single field named "Account ID".
Combine `customer_name`, `phone_number`, and `address` into a single field named "Customer Info".
Combine `modal_name`, `imei_1`, and `imei_2` into a single field named "Device Type".
Combine `agent_name`, `created_at`, and `updated_at` into a single field named "Agency".
Combine `reason_name` and `point` into a single field named "Service Type".
Map `reason_type_name` to a single field named "Service Reason". Since this data can be retrieved and displayed from the `smartphone_offline` system via the API, there is no need to create or update a database.
Also, as this is a temporary measure, please implement it by creating a new table in the 'Service' tab for display—similar to how the e-shop order list or product list was implemented earlier.
Please ensure the implementation follows the project's coding style.
------------------------------------------------------
We need to create a new "Privileges" tab to display service records.
We need to integrate with the `smartphone_offline` system to fetch and display the Privileges of registered users.
Since this involves integration with the `smartphone_offline` system, let's use a temporary table for the display.
The API format is as follows:
url: "/xxxx"
param: {
master_ids: "s2342523, sd652342, ej234234"
}
The response data format is:
{
items: [
{
master_id: s2342523
modal:
imei:
phone_number:
color:
title
}
]
}
Here, the `master_ids` correspond to the IDs linked to `SMARTPHONE_OFFLINE` in the "Accounts" tab.
The display requirements are as follows:
The table must include a filtering function—similar to the implementation for the e-shop order list or product list—allowing users to select specific `account_id`s.
Please map the fields as follows:
Map `master_id` to the "Account ID" field.
Map `modal` to the "Device Type" field.
Map `phone_number` to the "Phone Number" field.
Map `imei` to the "IMEI" field.
Map `color` to the "Device Color" field.
Map `title` to the "Service Summary" field.
Since the data is fetched directly from the `smartphone_offline` system via the API, there is no need to create or update a database—just like the implementation for the e-shop order list or product list mentioned earlier.
Please implement this while adhering to the project's coding style.
------------------------------------------------------
on accounts tab, for smartphone_offline project, once the project account is linked by manually or api call, we should show the 'link by phone" button on the row
on the header the values for total_amount, total_spend, total_orders, total product, open cases, should refelect the data from API call

also, on the service tab, and notes and files tab, those pages' values also reflect the result of apis
for example, for recent activity list of notes and files tab, it shows DB data right now
it should also reflect based api_result data
same as for service summary of service tab
------------------------------------------------------
1. How is pagination implemented for the order page within the user detail view, specifically for two separate e-store accounts?
2. The connection to the software store during the ordering process is not functioning correctly.
This should be implemented in the same way as it is handled on the `account/appstore/purchases` page in `crystal_web`.
3. When adding a user tier or reward points, a user must be selected; however, the following issue arises:
For users in `smartphone_offline`, the `account id` is a numeric value (e.g., `00153760`) rather than a user-defined identifier (consisting of alphanumeric characters). Consequently, it is impossible to determine which ID corresponds to which user.
Since users registered using their phone numbers, the `account id` in `smartphone_offline` is a numeric value automatically assigned by the administrative system.
Therefore, it would be highly beneficial to display the phone number alongside the `account id` when selecting users from `smartphone_offline`.
4. We intend to implement a feature that automatically assigns a user's level and tier by utilizing `getLevelInfo` in conjunction with the `smartphone_offline` system.
The response data is as follows:
items: [
    {
        master_id: ,
        loyal_level:,
        purchase_level:, 
        reward_point:
    }
]
In our system, `loyal_level` corresponds to "level," while `purchase_level` corresponds to "grade."
In other words, you must first add these "levels" and "grades" from the `smartphone_offline` business system into our CRM framework, and then populate them based on the values ​​returned by the corresponding API.
5. Feature for automatic addition of reward points
While the same API is used, the "sync points" button should be placed next to the "add point" button in the "reward points" section of the "Accounts" tab, and the "sync levels/grades" button should be placed next to the "add tier" button under "Memberships."
This synchronization currently only interfaces with the `smartphone_offline` business system.
6. Displaying order numbers from the e-shop in the "Orders" tab
The backend will convert `order_id` to `tx_id` before sending it, and the frontend should display this `tx_id`.

All these tasks pertain to the CRM framework within `crystal-admin`.
Please do not make any unnecessary changes to areas unrelated to the CRM.
------------------------
Consider a scenario within the "pending-registration" tab: the system currently prohibits both automatic merging and new registrations when a phone number is already in use by a different user.
Suppose there are three users: A, B, and C.
User A uses the phone number 123456789.
Users B and C both use the phone number 234567890.
Users A and C are already registered in the system.
The matching score between B and C is 60, while the score between A and B is 65.
User B is currently in the "pending-registration" tab.
An administrator reviews the data and decides to merge user B into user A.
However, because B’s phone number is already associated with user C, the merge cannot proceed.
To resolve this, the administrator must first remove the phone number from user C’s profile, then merge B into A.
As a result, user A ends up with two phone numbers linked to their account.
The administrator must then remove the phone number that was added to A during the merge and re-assign it to user C.
This is how the system is currently implemented.
The process is so complex that it would be difficult for anyone other than a developer—such as another administrator—to understand. Is there a way to make this process simpler and more intuitive?
------ 10 / 21 ---------------------------------
on privileges tab of customer details page, we recieve status as number, 0 and 1
1 is for "accepted" and 2 is for "pending"
so on frontend, we need to show with accepted and pending
---------------------------------------
on segments page, when adding a new segment, what is for project select box?
now, we have several projects on crm_projects table, 
but, on adding segment modal, if I open that select dropdown box, there is no project 
so, I can't understand what is for that project select box?
-----------------------------------------------------
As you know, the company "Crystal" encompasses several sub-projects, and a single user may hold multiple identifiers across different operational systems.
We aim to build a system where each customer is assigned a unique identifier, which will be used for registration across all of the company’s operational systems.
Please consider how we should implement this integration of unique identifiers.
In one of our operational systems, a user had registered two separate accounts using two different phone numbers; however, our CRM system determined that these belonged to the same customer and merged them into a single profile.
Now, as we move toward a registration model based on a unique identifier, should we require this customer to use that same unique identifier when registering—even for the accounts they had previously created as separate entities?

don't change code now
----------------------------------------------------------------
There are levels and grades specific to each operational system.
In addition, there are variables that indicate an entity's "active status."
These statuses can vary—for example, active, inactive, departed, blocked, or dormant (asleep).
These status values differ depending on the operational system.
For each system, the time of the last activity is tracked; if there has been no activity for a certain duration, the active status is updated accordingly.
How would you implement this within our system?
Could you reflect this active status for linked accounts on the "Accounts" tab?
and how would you address the issue of synchronization?

don't change any code right now
-------------------------------------------------
I have no idea how to design this feature
like if the sub system sends the last activity and decide the account's status on our system
or wheather the sub system sends the account activity status like active, blocked, or sth else
also, how to sync with the sub systems with these data?
if sub systems send last_activity, how to sync this last activity date with sub systesm?
updates everytime whenever a user takes an activity in the sub systems?
or make a sync button on our side for each customer or for all customers, and take syncronization?

I don't really know how to implement this
---------------------------- 10 / 22 -----------------------------
In our CRM system, there are two types of customers: individual customers and corporate customers.
Corporate customers can take various forms, such as authorized dealerships, retail outlets, or after-sales service centers.
Additionally, this category includes B2B clients.
B2B clients engage in direct transactions with the company, and the relationship typically ends there.
In contrast, corporate customers acting as dealerships purchase products from the company and may subsequently resell them to individual customers or other businesses.
Furthermore, dealerships may receive various forms of support, such as handling inquiries, repairs, or special preferential services.
B2B clients, however, do not receive any such services.

Given this situation, is it appropriate to classify both these dealerships and B2B clients under the single category of "corporate customer"?
---------------------------------------------------------
The criteria for determining the 'level' have changed in the context of how the operational framework, levels, and grades are linked.
Instead of using the `loyal_level` value provided via the API, we must now determine and store the level internally by using the `reward_point` value and mapping it against the 'from value' defined for each level within the project tiers.
For the 'grade,' you should continue to use the `purchase_level` value as is.The criteria for determining the 'level' have changed in the context of how the operational framework, levels, and grades are linked.
Instead of using the `loyal_level` value provided via the API, we must now determine and store the level internally by using the `reward_point` value and mapping it against the 'from value' defined for each level within the project tiers.
For the 'grade,' you should continue to use the `purchase_level` value as is.
-----------------------------10 / 23 ---------------------------------------
Currently, the purchase history from the App Store used in the CRM is retrieved by leveraging the same logic as the account page. When two accounts are linked, the system sends separate API requests for each, then consolidates and reorganizes the retrieved data before presenting it on the front end.
To improve this, we intend to create a new API specifically for the CRM, while keeping the existing API as is.
The URL will be `getPurchaseListByIds`.
Params: {
customers: [
{customer_pk: , customer_id: }
],
isDisplayStart: ,
iDisplayLength: ,
from: ,
to: ,
sSearch
}

The response structure will be similar to the previous one, with the addition of `tPrice` and the inclusion of `account_id` in each item within `mData`.
-------------------------------------------------------------------------------
A feature for linking accounts within the current `smartphone_offline` system has already been implemented.
I need to update this.
URL: /getUserByPhone
params: {
phone_numbers: "phone1,phone2"
}
response: {
    items: [
        {
            phone_number: ,
            master_id: ,
            account_pk:
        }
    ]
}
Also, on the customers page, there is a button that allows you to link the `smartphone_offline` account for all users at once—how should we handle cases where a limit is reached during this process?
---------------------------------------------------------------------
Displaying the purchase history from the online store relied on an existing API from the 'account' page, which only allowed for retrieving data for one primary key (PK) at a time.
Consequently, when two or more accounts were linked, the system had to fetch the data for each account individually and then perform additional processing on the backend before sending it to the frontend—a process that compromised the accuracy of the information.
Therefore, the plan is to continue using the existing API for the 'account' page while integrating a new, separate API to handle these cases.
URL: /getOrdersListByIds
params: {
    userIds: "xxx, yyy",
    start: ,
    length:
}
The response is similar to the previous one, but with the addition of `tPrice` (representing the total price) to the `data` object, and the inclusion of an `account_id` in each item within the `lists` array.
----------------------------------------------------------------
I also intend to implement level and grade synchronization with the e-store.
Lonely is similar to smartphone_offline.
It sends userIds as a parameter.
{ userIds: "xxx, yyyy, zzzz"}
The response is as follows.
{
    status:
    items: [
        {
            account_id: xxx,
            loyal_level: ,
            loyal_grade: ,
            updated_at: 
        }
    ]
}
The `updated_at` field must be used to accurately reflect the date on which a rank or grade was changed.