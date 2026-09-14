-- get total thumb up count and rating count for the specific blog
SELECT 
  -- Total Thumb Up count (rating_type = 1 corresponds to 'thumb')
  (SELECT COUNT(*) 
    FROM blog_ratings 
    WHERE blog_pk = :blog_pk 
      AND rating_type = 1) AS thumb_count,  -- Count thumbs for the blog

  -- Total Star Rating count (rating_type = 2 corresponds to 'star')
  (SELECT COUNT(*) 
    FROM blog_ratings 
    WHERE blog_pk = :blog_pk 
      AND rating_type = 2) AS rating_count  -- Count stars for the blog

FROM dual;  -- Dual is a special one-row, one-column table in Oracle


-- Query for Ordering Blogs by Total Thumb Count or Rating Count
-- But its not necessary because I already have blog_statistics table
SELECT 
  b.blog_pk,
  b.title,
  COALESCE(SUM(CASE WHEN br.rating_type = 1 THEN 1 ELSE 0 END), 0) AS thumb_count,
  COALESCE(SUM(CASE WHEN br.rating_type = 2 THEN 1 ELSE 0 END), 0) AS rating_count
FROM 
  blogs b
LEFT JOIN 
  blog_ratings br ON b.blog_pk = br.blog_pk
GROUP BY 
  b.blog_pk, b.title
ORDER BY 
  CASE WHEN :order_by = 'thumb' THEN thumb_count ELSE rating_count END DESC;


-- Example Query: Search Blogs by Category, Title, User Name, and Content
SELECT 
  b.blog_pk, 
  b.title, 
  b.content, 
  u.user_name, 
  b.created_at,
  b.updated_at,
  b.category_id
FROM 
  blogs b
JOIN 
  users u ON b.user_pk = u.user_pk
WHERE 
  (b.category_id = :category_id OR :category_id IS NULL)  -- Filter by category
  AND (LOWER(b.title) LIKE LOWER(:title) OR :title IS NULL)  -- Search by title
  AND (LOWER(u.user_name) LIKE LOWER(:user_name) OR :user_name IS NULL)  -- Search by user name
  AND (LOWER(REGEXP_REPLACE(b.content, '<[^>]+>', '')) LIKE LOWER(:content) OR :content IS NULL)  -- Search by cleaned content (stripped HTML)
ORDER BY 
  b.created_at DESC  -- Order by created_at (or any other column you want)
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY;  -- Pagination (offset and limit)


-- survey question stats by gender (1)
select
coalesce(sum(case when users.gender='M' THEN 1 ELSE 0 END), 0) as man_count,
coalesce(sum(case when users.gender='F' THEN 1 ELSE 0 END), 0) as woman_count
from SURVEY_RESPONSES responses
left join SURVEY_CHOICES choices on responses.choice_pk=choices.choice_pk
left join users on responses.user_pk=users.user_pk
where responses.question_pk=8

-- survey question stats by gender (2)
select
count(1), users.gender
from SURVEY_RESPONSES responses
left join SURVEY_CHOICES choices on responses.choice_pk=choices.choice_pk
left join users on responses.user_pk=users.user_pk
where responses.question_pk=8
group by users.gender

-- survey question stats by choices
select
count(1), responses.choice_pk
, choices.choice_text
from SURVEY_RESPONSES responses
left join SURVEY_CHOICES choices on responses.choice_pk=choices.choice_pk
left join users on responses.user_pk=users.user_pk
where responses.question_pk=8
group by responses.choice_pk, choices.CHOICE_TEXT

-- appstore point rank
select
	T1.table_pk, T1.user_pk, T1.rank,
	T1.total_points, T1.limit_points, T1.updated_at,
	users.user_id, users.user_name
from
(
select appstore_stats.table_pk, appstore_stats.user_pk ,appstore_stats.total_points, appstore_stats.limit_points,
	TO_CHAR(appstore_stats.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at,
	ROW_NUMBER() OVER (ORDER BY total_points DESC) AS rank
from APPSTORE_POINT_STATS appstore_stats
) T1
left join users on T1.user_pk = users.user_pk
where T1.rank <= 1000
order by T1.rank
