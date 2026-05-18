from datetime import datetime, timedelta


def calculate_sm2(score: int, ease_factor: float = 2.5, interval_days: int = 1, repetitions: int = 0) -> dict:
    """
    SM-2 间隔重复算法。
    score 评分: 0=完全忘记, 1=记得但困难, 2=记得, 3=很轻松
    返回更新后的 {ease_factor, interval_days, repetitions, next_review}
    """
    if score < 0 or score > 3:
        raise ValueError("评分必须在 0-3 之间")

    if score < 2:
        # 忘记或困难：重置间隔
        new_repetitions = 0
        new_interval = 1
        new_ease = max(1.3, ease_factor - 0.2)
    else:
        # 成功回忆：扩大间隔
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 3
        else:
            new_interval = round(interval_days * ease_factor)

        new_repetitions = repetitions + 1
        new_ease = ease_factor + (0.1 - (3 - score) * (0.08 + (3 - score) * 0.02))

    new_ease = max(1.3, min(2.5, new_ease))
    next_review = datetime.utcnow() + timedelta(days=new_interval)

    return {
        "ease_factor": round(new_ease, 2),
        "interval_days": new_interval,
        "repetitions": new_repetitions,
        "next_review": next_review,
    }
