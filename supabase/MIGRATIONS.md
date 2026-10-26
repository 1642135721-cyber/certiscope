# 分享版本迁移编号

仅用于全新数据库，不要用于已有原编号迁移记录的数据库。SQL 内容保持原样，时间编号补齐到 14 位，防止短编号的基础表迁移排在长编号增量之后。

| 原文件 | 分享文件 |
| --- | --- |
| 202610220001_auth_roles.sql | 20261022000100_auth_roles.sql |
| 202610220002_private_files.sql | 20261022000200_private_files.sql |
| 202610220003_projects_tasks.sql | 20261022000300_projects_tasks.sql |
| 20261022000401_material_registration.sql | 20261022000401_material_registration.sql |
| 20261022000402_historical_file_scope.sql | 20261022000402_historical_file_scope.sql |
| 20261022000403_scope_candidates.sql | 20261022000403_scope_candidates.sql |
| 20261022000404_scope_confirmation.sql | 20261022000404_scope_confirmation.sql |
| 20261022000405_intake_scope_provisional.sql | 20261022000405_intake_scope_provisional.sql |
| 202610220004_materials_facts.sql | 20261022000400_materials_facts.sql |
| 202610230001_gv_rule_decisions.sql | 20261023000100_gv_rule_decisions.sql |
| 202610230002_gv_round_opinions.sql | 20261023000200_gv_round_opinions.sql |
| 202610230003_scope_from_round_materials.sql | 20261023000300_scope_from_round_materials.sql |
| 202610230004_gv_ai_assessments.sql | 20261023000400_gv_ai_assessments.sql |
| 20261023000550_supplement_checks.sql | 20261023000550_supplement_checks.sql |
| 202610230005_admin_gv_handoff.sql | 20261023000500_admin_gv_handoff.sql |
| 202610230006_project_categories.sql | 20261023000600_project_categories.sql |
| 202610230007_historical_opinion_references.sql | 20261023000700_historical_opinion_references.sql |
| 202610230008_refine_category_assignment.sql | 20261023000800_refine_category_assignment.sql |
| 202610230009_historical_opinion_exec_scope.sql | 20261023000900_historical_opinion_exec_scope.sql |
| 202610230010_gv_rule_package_and_runs.sql | 20261023001000_gv_rule_package_and_runs.sql |
| 202610240001_gv_opinion_freshness.sql | 20261024000100_gv_opinion_freshness.sql |
| 202610240002_project_trash.sql | 20261024000200_project_trash.sql |
| 202610240003_project_trash_visibility.sql | 20261024000300_project_trash_visibility.sql |
| 202610240004_project_trash_policy_guard.sql | 20261024000400_project_trash_policy_guard.sql |
| 202610250001_gv_trash_targeted_purge.sql | 20261025000100_gv_trash_targeted_purge.sql |
| 202610250002_project_create_atomic.sql | 20261025000200_project_create_atomic.sql |
| 202610260001_admin_material_removal.sql | 20261026000100_admin_material_removal.sql |
| 202610260002_admin_remove_unselected_submitted.sql | 20261026000200_admin_remove_unselected_submitted.sql |
