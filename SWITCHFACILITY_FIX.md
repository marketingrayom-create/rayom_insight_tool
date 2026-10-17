# Switchfacility fix

The `/data/facilities` browser response is already the JSON object containing `currentFacilityCode`; it is not wrapped in `data`. The backend previously read `facility_result.data.currentFacilityCode`, causing `None`. This version reads `facility_result.currentFacilityCode`.

The company-select endpoint also reports `successful: true` when the facility switch succeeds even if the selected facility has zero inventory rows, so the React dropdown can still update.
