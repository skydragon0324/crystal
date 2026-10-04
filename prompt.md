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

