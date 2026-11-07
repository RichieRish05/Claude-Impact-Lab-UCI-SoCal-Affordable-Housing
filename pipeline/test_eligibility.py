from eligibility import evaluate, vacancy


def test_multifamily_lot_fits_capped_parcels():
    ok, homes, reason = evaluate("RM", "multifamily", 21_600, False, 0.05)
    assert ok and homes == 10
    assert "capped at 10" in reason


def test_multifamily_counts_600_sqft_parcels():
    assert evaluate("RMH", "multifamily", 5_000, False, 0.05)[:2] == (True, 8)


def test_single_family_needs_vacancy():
    ok, homes, reason = evaluate("RL", "single_family", 8_400, False, 0.05)
    assert (ok, homes) == (False, 0)
    assert "not vacant" in reason


def test_vacant_single_family_uses_1200_sqft_parcels():
    ok, homes, reason = evaluate("RL", "single_family", 8_400, True, 0.9)
    assert (ok, homes) == (True, 7)
    assert "uncertain" not in reason


def test_uncertain_vacancy_is_flagged():
    assert "check imagery" in evaluate("RL", "single_family", 8_400, True, 0.5)[2]


def test_over_one_and_a_half_acres():
    ok, homes, reason = evaluate("RM", "multifamily", 65_341, False, 0.05)
    assert (ok, homes) == (False, 0)
    assert "1.5-acre" in reason


def test_exactly_one_and_a_half_acres_is_allowed():
    assert evaluate("RM", "multifamily", 65_340, False, 0.05)[0]


def test_too_small_for_two_parcels():
    assert evaluate("RM", "multifamily", 1_199, False, 0.05)[:2] == (False, 0)
    assert evaluate("RL", "single_family", 2_399, True, 0.9)[:2] == (False, 0)
    assert evaluate("RL", "single_family", 2_400, True, 0.9)[:2] == (True, 2)


def test_unverified_or_nonresidential_zone():
    assert evaluate("SP9", None, 10_000, True, 0.9)[:2] == (False, 0)
    assert "mobile home park" in evaluate("RMP", "mobile_home_park", 10_000, True, 0.9)[2]


def test_vacancy_signals():
    assert vacancy("RESIDENTIAL-VACANT LAND", None, None) == (True, 0.9)
    assert vacancy("RESIDENTIAL-VACANT LAND", 50_000, None) == (True, 0.6)
    assert vacancy(None, None, None) == (True, 0.5)
    assert vacancy(None, 100_000, 1_500) == (False, 0.1)
    assert vacancy("SINGLE FAMILY RESIDENTIAL", 300_000, 1_800) == (False, 0.05)
    assert vacancy("EXEMPT (FULL OR PARTIAL)", None, None) == (False, 0.2)
