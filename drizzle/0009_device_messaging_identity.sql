ALTER TABLE `contacts` ADD `device_public_key` text;
ALTER TABLE `contacts` ADD `device_id` text;
ALTER TABLE `contacts` ADD `device_certificate` text;
ALTER TABLE `contacts` ADD `device_signed_pre_key` text;
ALTER TABLE `contacts` ADD `device_signed_pre_key_sig` text;
ALTER TABLE `contacts` ADD `device_signed_pre_key_id` integer;
