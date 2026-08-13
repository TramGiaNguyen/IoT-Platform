-- Add is_analyzed column to thiet_bi for AI analytics tracking
ALTER TABLE thiet_bi
    ADD COLUMN is_analyzed TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = device payload has been analyzed by AI pipeline'
    AFTER is_active;
