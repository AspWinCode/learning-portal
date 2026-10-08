from app.permissions import VALID_PERMISSION_KEYS

AI_STUDIO_KEYS = {
    "ai_studio.access",
    "ai_studio.manage_workspace",
    "ai_studio.manage_knowledge",
}


def test_all_ai_studio_permission_keys_registered():
    assert AI_STUDIO_KEYS <= VALID_PERMISSION_KEYS


def test_ai_studio_does_not_redefine_academy_ai_keys():
    # AI Studio — generic-слой поверх Academy AI, а не замена: модуль не должен
    # вводить собственные версии academy_ai.* прав.
    assert not any(key.startswith("academy_ai.") for key in AI_STUDIO_KEYS)


def test_ai_studio_no_longer_owns_posting_permissions():
    # Генерация постов/публикация переехали в smm_projects — AI Studio не
    # должен снова заводить ai_studio.generate/publish/manage_content.
    posting_keys = {"ai_studio.generate", "ai_studio.publish", "ai_studio.manage_content", "ai_studio.manage_templates"}
    assert not (posting_keys & VALID_PERMISSION_KEYS)
