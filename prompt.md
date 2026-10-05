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
When adding project tiers, the system needs to allow administrators to modify the scoring rules associated with those tiers.
Currently, on the analysis page, users are assigned overall grades ranging from AAA to C, but it is unclear where or how these were determined.
These tiers should be managed within the project tier settings and automatically assigned based on the scoring rules; the scoring system itself must also be modifiable.
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