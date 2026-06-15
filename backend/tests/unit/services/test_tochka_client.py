from app.services.tochka_client import extract_incoming_transactions


def test_extract_transactions_prefers_debtor_over_debtor_agent_for_income():
    statement = {
        "Data": {
            "Statement": [
                {
                    "Transaction": [
                        {
                            "transactionId": "op-1",
                            "creditDebitIndicator": "Credit",
                            "amount": 4000,
                            "bookingDate": "2026-06-15",
                            "DebtorAgent": {"Name": 'ООО "Банк Точка"'},
                            "Debtor": {
                                "Name": "Иванов Иван Иванович",
                                "phone": "+7 999 000-00-00",
                            },
                        }
                    ]
                }
            ]
        }
    }

    result = extract_incoming_transactions(statement)

    assert result[0]["payer_name"] == "Иванов Иван Иванович"
    assert result[0]["payer_phone_raw"] == "+7 999 000-00-00"


def test_extract_transactions_reads_related_debtor_party():
    statement = {
        "Transaction": [
            {
                "transactionId": "op-2",
                "creditDebitIndicator": "Credit",
                "Amount": {"Amount": "2500.00"},
                "RelatedParties": {
                    "Debtor": {
                        "Party": {
                            "Name": "Петров Петр",
                            "ContactDetails": {"PhoneNumber": "89991234567"},
                        }
                    }
                },
                "DebtorAgent": {"Name": 'ООО "Банк Точка"'},
            }
        ]
    }

    result = extract_incoming_transactions(statement)

    assert result[0]["payer_name"] == "Петров Петр"
    assert result[0]["payer_phone_raw"] == "89991234567"


def test_extract_transactions_reads_phone_from_payment_purpose():
    statement = {
        "Transaction": [
            {
                "transactionId": "op-3",
                "creditDebitIndicator": "Credit",
                "amount": 4000,
                "payerName": 'ООО "Банк Точка"',
                "paymentPurpose": "Перевод по СБП от +7 (999) 111-22-33 за обучение",
            }
        ]
    }

    result = extract_incoming_transactions(statement)

    assert result[0]["payer_phone_raw"] == "+7 (999) 111-22-33"
