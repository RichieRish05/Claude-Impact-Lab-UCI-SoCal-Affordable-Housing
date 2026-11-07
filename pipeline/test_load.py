import pandas as pd

from load import address, assessed_value, drop_unaddressed


def test_assessed_value_counts_land_without_improvements():
    p = pd.DataFrame({
        "AssdAmt": ["", "", "500000"],
        "LandVal": ["38240", "", "1"],
        "ImprovedVal": ["", "", "1"],
    })
    assert assessed_value(p).tolist() == [38240, pd.NA, 500000]


def test_address_without_a_house_number_is_dropped():
    # "NA <street>" lots are often nowhere near that street.
    row = lambda site: pd.Series({"SiteAddress": site, "SiteCityState": "HUNTINGTON BEACH"})
    assert address(row("NA HUNTINGTON ST")) is None
    assert address(row("4481 LOS PATOS AVE")) == "4481 Los Patos Ave, Huntington Beach, CA"


def test_lots_without_an_address_are_dropped():
    parcels = pd.DataFrame({"apn": ["1", "2"], "address": ["1 Main St, Huntington Beach, CA", None]})
    assert drop_unaddressed(parcels).apn.tolist() == ["1"]
