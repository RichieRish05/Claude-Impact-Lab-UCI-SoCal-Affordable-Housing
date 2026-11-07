from eligibility import common_lot, evaluate, mostly_empty, not_a_building_lot, vacancy

HOUSE = "SINGLE FAMILY RESIDENTIAL"


def test_multifamily_lot_fits_capped_parcels():
    ok, homes, reason = evaluate("RM", "multifamily", 21_600, False, 0.05, empty=True, use_code=HOUSE)
    assert ok and homes == 10
    assert "capped at 10" in reason


def test_multifamily_counts_600_sqft_parcels():
    assert evaluate("RMH", "multifamily", 5_000, False, 0.05, empty=True, use_code=HOUSE)[:2] == (True, 8)


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
    ok, homes, reason = evaluate("RM", "multifamily", 65_341, False, 0.05, empty=True, use_code=HOUSE)
    assert (ok, homes) == (False, 0)
    assert "1.5-acre" in reason


def test_exactly_one_and_a_half_acres_is_allowed():
    assert evaluate("RM", "multifamily", 65_340, False, 0.05, empty=True, use_code=HOUSE)[0]


def test_too_small_for_two_parcels():
    assert evaluate("RM", "multifamily", 1_199, False, 0.05, empty=True, use_code=HOUSE)[:2] == (False, 0)
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


def test_lettered_lot_without_a_building_is_common_land():
    assert common_lot("E", "Lot", None) and common_lot("AB", "Lot", 0)
    assert not common_lot("E", "Lot", 1_800)
    assert not common_lot("12", "Lot", None) and not common_lot(None, "Lot", None)
    assert common_lot("3", "Private RoW", None)


def test_shared_land_is_never_eligible():
    reason = not_a_building_lot("E", True, 0)
    assert "Lot E" in reason
    ok, homes, _ = evaluate("RL", "single_family", 65_249, True, 0.9, not_buildable=reason)
    assert (ok, homes) == (False, 0)
    assert not evaluate("RM", "multifamily", 20_000, False, 0.05, not_buildable=reason)[0]


def test_vacant_lot_without_any_assessed_value_is_shared_land():
    assert "assessed value" in not_a_building_lot(None, True, None)
    assert not_a_building_lot(None, True, 38_240) is None
    assert not_a_building_lot(None, False, None) is None


def test_business_is_never_mostly_empty():
    ok, _, reason = evaluate("RM", "multifamily", 60_000, False, 0.05, empty=True, use_code="RETAIL STORES ( PERSONAL SERVICES, PHOTOGRAPHY, TRAVEL)")
    assert not ok and "already built" in reason
    assert evaluate("RM", "multifamily", 9_000, False, 0.05, empty=True, use_code="SINGLE FAMILY RESIDENTIAL")[0]


def test_mostly_empty_needs_little_floor_area_and_little_building_value():
    assert mostly_empty(800, 7_500, 900_000, 100_000)
    assert not mostly_empty(1_347, 60_166, 110_346, 5_339_945)  # floor area looks small, value says developed
    assert not mostly_empty(4_000, 7_500, 900_000, 100_000)
    assert not mostly_empty(None, 7_500, 900_000, 100_000)  # no recorded building area: can't tell
    assert not mostly_empty(800, 7_500, None, None)


def test_developed_multifamily_lot_is_not_eligible():
    ok, homes, reason = evaluate("RM", "multifamily", 21_600, False, 0.05)
    assert (ok, homes) == (False, 0)
    assert "already built" in reason


def test_mostly_empty_multifamily_lot_is_eligible_and_says_so():
    ok, _, reason = evaluate("RM", "multifamily", 7_500, False, 0.05, empty=True, use_code=HOUSE)
    assert ok and "mostly empty" in reason.lower()
    assert "mostly empty" not in evaluate("RM", "multifamily", 7_500, True, 0.9)[2].lower()


def test_only_a_lone_house_can_be_mostly_empty():
    # Old apartment buildings can record tiny floor areas and low improvement values.
    for use in ["APARTMENT HOUSE (5+ UNITS)", "DUPLEX (2 UNITS, ANY COMBINATION)", None]:
        ok, _, reason = evaluate("RM", "multifamily", 20_000, False, 0.05, empty=True, use_code=use)
        assert not ok and "already built" in reason
    assert evaluate("RM", "multifamily", 20_000, False, 0.05, empty=True, use_code="RESIDENTIAL (GENERAL) (SINGLE)")[0]
