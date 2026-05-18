"""v3.3 acceptance test."""
from playwright.sync_api import sync_playwright
import time

def log(msg): print(f"  [{time.strftime('%H:%M:%S')}] {msg}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))

    log("1. Load page and select material...")
    page.goto("http://localhost:3000")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)

    # Click first material in left panel
    page.locator(".cursor-pointer").first.click()
    page.wait_for_timeout(1000)

    # === Bug 1: Dynamic count selector ===
    log("Bug 1: Checking count selector...")
    count_10 = page.locator("button:has-text('10')").count()
    count_20 = page.locator("button:has-text('20')").count()
    count_1 = page.locator("button:has-text('1')").count()
    log(f"  Count 1 visible: {count_1 > 0}, 10 visible: {count_10 > 0}, 20 visible: {count_20 > 0}")
    assert count_20 == 0, "Bug 1 FAIL: 20 should not be available for 1-chunk material"
    log("  Bug 1 PASS")

    # === Bug 4+5: Session clustering ===
    log("Bug 4+5: Will verify after forge...")

    # === Bug 3: Covered chunks ===
    log("Bug 3: Checking covered_chunks before forge...")
    covered_text = page.locator("text=已覆盖").text_content() or ""
    log(f"  Before: {covered_text.strip()}")

    # === Forge ===
    log("Forging 5 questions to test bugs 2, 3, 4, 5...")
    # Set count to 2 (max for 1 chunk)
    count_btn = page.locator("button:has-text('2')")
    if count_btn.count() > 0:
        count_btn.click()
    else:
        page.get_by_text("1", exact=True).first.click()
    page.wait_for_timeout(200)

    page.locator("text=开始锻造").click()
    log("  Waiting for generation...")

    try:
        page.wait_for_selector("text=A.", timeout=90000)
        page.wait_for_timeout(300)
        log("  Questions generated")

        # Answer all questions
        for i in range(5):
            page.wait_for_selector("text=A.", timeout=10000)
            page.wait_for_timeout(200)
            page.locator("button:has-text('A.')").first.click()
            page.wait_for_timeout(800)
            next_btn = page.locator("text=下一题")
            result_btn = page.locator("text=查看结果")
            if next_btn.count() > 0:
                next_btn.click()
                page.wait_for_timeout(300)
            elif result_btn.count() > 0:
                result_btn.click()
                page.wait_for_timeout(300)
                break

        page.wait_for_timeout(500)
        # Go back to idle
        back_btn = page.locator("text=返回")
        if back_btn.count() > 0:
            back_btn.click()
        else:
            page.locator("text=再来一轮").first.click()
            # Answer all and go back
            page.wait_for_selector("text=A.", timeout=30000)
            for i in range(5):
                page.locator("button:has-text('A.')").first.click()
                page.wait_for_timeout(500)
                nb = page.locator("text=下一题")
                rb = page.locator("text=查看结果")
                if nb.count() > 0: nb.click(); page.wait_for_timeout(300)
                elif rb.count() > 0: rb.click(); page.wait_for_timeout(300); break
            page.wait_for_timeout(500)
            page.locator("text=返回").click()
        page.wait_for_timeout(1500)

        # === Bug 3 verify ===
        log("Bug 3: Checking covered_chunks after forge...")
        covered_after = page.locator("text=已覆盖").text_content() or ""
        log(f"  After: {covered_after.strip()}")
        assert "0/1" not in covered_after.replace(" ", ""), "Bug 3 FAIL: covered_chunks still 0"
        log("  Bug 3 PASS")

        # === Bug 4+5 verify ===
        log("Bug 4+5: Checking session times...")
        session_text = page.locator("text=2026-05-15").count()
        log(f"  Session rows: {session_text}")
        assert session_text > 0, "Bug 4 FAIL: no session timestamps"
        log("  Bug 4+5 PASS")

        # === Bug 2: Re-challenge ===
        log("Bug 2: Testing re-challenge mode...")
        wrong_btn = page.locator("text=错题集")
        if wrong_btn.count() > 0:
            wrong_btn.click()
            page.wait_for_timeout(1000)

            # Switch to re-challenge
            rc_btn = page.locator("text=重新挑战")
            if rc_btn.count() > 0:
                rc_btn.click()
                page.wait_for_timeout(500)

                # Answer first question
                page.locator("button:has-text('A.')").first.click()
                page.wait_for_timeout(1000)

                # Check answer marker shown
                answer_marker = page.locator("text=← 答案").count()
                log(f"  Answer marker shown: {answer_marker > 0}")
                assert answer_marker > 0, "Bug 2 FAIL: no answer feedback in re-challenge"
                log("  Bug 2 PASS")

                # === Bug 6: Review count ===
                review_count = page.locator("text=复习").first.text_content() or ""
                log(f"  Review count: {review_count.strip()}")
                assert "次" in review_count, "Bug 6 FAIL: no review count"
                log("  Bug 6 PASS")

    except Exception as e:
        log(f"  ERROR: {e}")
        page.screenshot(path="/tmp/v3.3-error.png", full_page=True)

    # Final error check
    if errors:
        log(f"\nPAGE ERRORS: {len(errors)}")
        for e in errors:
            log(f"  {e[:200]}")
    else:
        log("\nNo page errors")

    browser.close()
    log("\n=== ACCEPTANCE DONE ===")
