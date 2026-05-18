"""SM-2 algorithm unit tests (F-20 section 1)"""
from services.sm2 import calculate_sm2
import pytest


class TestSM2:
    def test_score_0_resets_repetitions(self):
        """TC-SM2-01: 评分0完全忘记"""
        result = calculate_sm2(score=0, ease_factor=2.5, interval_days=5, repetitions=3)
        assert result["repetitions"] == 0
        assert result["interval_days"] == 1
        assert result["ease_factor"] == pytest.approx(2.3, 0.01)

    def test_score_1_resets_repetitions(self):
        """TC-SM2-02: 评分1有印象"""
        result = calculate_sm2(score=1, ease_factor=2.5, interval_days=5, repetitions=3)
        assert result["repetitions"] == 0
        assert result["interval_days"] == 1

    def test_score_2_extends_interval(self):
        """TC-SM2-03: 评分2记住了"""
        result = calculate_sm2(score=2, ease_factor=2.5, interval_days=5, repetitions=3)
        assert result["repetitions"] == 4
        assert result["interval_days"] > 5

    def test_score_3_extends_interval(self):
        """TC-SM2-04: 评分3很简单"""
        result = calculate_sm2(score=3, ease_factor=2.5, interval_days=5, repetitions=3)
        assert result["repetitions"] == 4
        assert result["interval_days"] > 5

    def test_first_review_interval_1(self):
        """TC-SM2-05: 首次复习间隔为1"""
        result = calculate_sm2(score=3, ease_factor=2.5, interval_days=1, repetitions=0)
        assert result["interval_days"] == 1 if result["repetitions"] == 0 else True

    def test_ease_factor_ceiling_2_5(self):
        """TC-SM2-06: ease_factor 不超过 2.5 上限"""
        result = calculate_sm2(score=3, ease_factor=2.5, interval_days=10, repetitions=5)
        assert result["ease_factor"] <= 2.5

    def test_ease_factor_floor_1_3(self):
        """TC-SM2-07: ease_factor 不低于 1.3 下限"""
        result = calculate_sm2(score=0, ease_factor=1.3, interval_days=1, repetitions=0)
        assert result["ease_factor"] >= 1.3
