CREATE UNIQUE INDEX "labels_project_id_lower_name_key" ON "labels" ("project_id", lower("name"));
