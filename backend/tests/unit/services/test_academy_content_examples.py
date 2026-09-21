from app.services.academy_ai import content_examples as ce


class _Example:
    def __init__(self, id, kind, direction=None, title=None, body="text", is_active=True):
        self.id = id
        self.kind = kind
        self.direction = direction
        self.title = title
        self.body = body
        self.is_active = is_active


def test_as_prompt_block_empty_without_examples():
    assert ce.as_prompt_block([]) == ""


def test_as_prompt_block_includes_title_and_body_style_note():
    examples = [_Example(1, "post", title="Набор в сентябре", body="Хук!\nПольза.\nЖдём тебя!")]
    block = ce.as_prompt_block(examples)
    assert "ОБРАЗЦЫ УДАЧНЫХ ПОСТОВ" in block
    assert "Набор в сентябре" in block
    assert "Хук!" in block
    assert "НЕ копируй из них факты" in block


def test_as_prompt_block_multiple_examples_separated():
    examples = [_Example(1, "post", body="Первый"), _Example(2, "post", body="Второй")]
    block = ce.as_prompt_block(examples)
    assert "Первый" in block and "Второй" in block
    assert block.count("---") == 1
