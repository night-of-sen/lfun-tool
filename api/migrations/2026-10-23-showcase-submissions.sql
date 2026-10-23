-- P2 创作者投稿：submissions 表补列（只加列，不删列）
-- 在测试库先跑，生产上线前再跑一次。本机无 PHP/MySQL，未实测。
-- 注意：若某列已存在（例如已由 api/lib/db.php 的 ensure_submission_showcase_columns() 自动补过），
-- 对应 ALTER 会报错，可忽略该条继续跑下一条；不要因此中断。
-- MySQL 适用；SQLite 请把 VARCHAR 长度忽略，语法相同（SQLite 允许 ADD COLUMN，但不支持 IF NOT EXISTS 写法）。
ALTER TABLE submissions ADD COLUMN tool_name VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN oneliner VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN work_url VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN author_name VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN author_url VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN primary_category VARCHAR(40) NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN tags VARCHAR(300) NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN screenshot_url VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN video_url VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN price_model VARCHAR(20) NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN form VARCHAR(20) NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN highlights TEXT;
ALTER TABLE submissions ADD COLUMN price_detail VARCHAR(300) NOT NULL DEFAULT '';
-- P6 点赞与浏览：只新建表，不改旧表
CREATE TABLE IF NOT EXISTS tool_votes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tool_id VARCHAR(80) NOT NULL,
  voter_hash CHAR(32) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS tool_views (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tool_id VARCHAR(80) NOT NULL,
  view_hash CHAR(32) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
