from app.permissions import VALID_PERMISSION_KEYS

SMM_PROJECTS_KEYS = {
    "smm_projects.access",
    "smm_projects.manage_project",
    "smm_projects.manage_knowledge",
    "smm_projects.manage_templates",
    "smm_projects.manage_channels",
    "smm_projects.generate",
    "smm_projects.manage_content",
    "smm_projects.publish",
}


def test_all_smm_projects_permission_keys_registered():
    assert SMM_PROJECTS_KEYS <= VALID_PERMISSION_KEYS


def test_smm_projects_does_not_redefine_ai_studio_keys():
    # Отдельный модуль от AI Studio — не должен вводить ai_studio.* права.
    assert not any(key.startswith("ai_studio.") for key in SMM_PROJECTS_KEYS)
