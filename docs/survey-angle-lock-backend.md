# Survey Angle Lock Backend Drop-In

Backend source of truth used while preparing this:

`C:\Users\Admin\Documents\NDCS SmartRPD\database & api management\API code\dev\SmartRPD API backup 2026 April 4th`

## 1. Database Migration

Run once on the REST API database:

```sql
ALTER TABLE cases
ADD COLUMN survey_angle_locked TINYINT(1) NOT NULL DEFAULT 0,
ADD COLUMN survey_angle_locked_at DATETIME NULL DEFAULT NULL,
ADD COLUMN survey_angle_locked_by INT NULL DEFAULT NULL;
```

Optional index:

```sql
CREATE INDEX idx_cases_survey_angle_locked ON cases (survey_angle_locked);
```

## 2. routes/smartrpd.routes.js

Add these routes near the existing `/case` routes:

```js
router.post("/case/survey-angle-lock/get", smart.getSurveyAngleLock);
router.post("/case/survey-angle-lock/update", smart.updateSurveyAngleLock);
```

For example:

```js
router.put("/case/:id", smart.updateCase);
router.post("/case", smart.createCase);
router.post("/case/get/:id", smart.findCaseById);
router.post("/case/survey-angle-lock/get", smart.getSurveyAngleLock);
router.post("/case/survey-angle-lock/update", smart.updateSurveyAngleLock);
router.post("/case/getall", smart.getAllCases);
```

## 3. models/case.model.js

In `CaseData.findById`, include the lock fields in the selected case columns:

```js
let query =
    "SELECT cases.id, case_id, creation_date, last_updated, upper_insertion_angle_x, upper_insertion_angle_y, upper_insertion_angle_z, " +
    "lower_insertion_angle_x, lower_insertion_angle_y, lower_insertion_angle_z, cases.deleted, users.username, process_upper, process_lower, " +
    "survey_angle_locked, survey_angle_locked_at, survey_angle_locked_by, " +
    "IFNULL(upper_jaw_status.status, 0) as upper_status, IFNULL(lower_jaw_status.status, 0) as lower_status " +
    "FROM cases " +
```

Then add these methods before `module.exports = CaseData;`:

```js
CaseData.getSurveyAngleLock = (id, hideDeleted = true, result) => {
    let query =
        "SELECT id AS case_int_id, survey_angle_locked, survey_angle_locked_at, survey_angle_locked_by " +
        "FROM cases WHERE id = ?";
    if (hideDeleted) query += " AND deleted = 0";

    sql.query(query, [id], (err, res) => {
        if (err) {
            console.log("error: ", err);
            result(err, null);
            return;
        }
        if (res.length) {
            result(null, res[0]);
            return;
        }
        result({ kind: "not_found" }, null);
    });
};

CaseData.updateSurveyAngleLock = (id, locked, uuid, result) => {
    const lockedValue = locked ? 1 : 0;
    sql.query(
        "UPDATE cases SET " +
        "survey_angle_locked = ?, " +
        "survey_angle_locked_at = CASE WHEN ? = 1 THEN NOW() ELSE survey_angle_locked_at END, " +
        "survey_angle_locked_by = CASE WHEN ? = 1 THEN (SELECT users.id FROM users WHERE users.uuid = ? LIMIT 1) ELSE survey_angle_locked_by END " +
        "WHERE id = ? AND deleted = 0",
        [lockedValue, lockedValue, lockedValue, uuid, id],
        (err, res) => {
            if (err) {
                console.log("error: ", err);
                result(err, null);
                return;
            }
            if (res.affectedRows == 0) {
                result({ kind: "not_found" }, null);
                return;
            }
            CaseData.getSurveyAngleLock(id, true, result);
        }
    );
};

```

## 4. controllers/smartrpd.controller.js

Add these exports in the Cases region, for example just before `exports.updateCase`:

```js
function surveyCaseIntIdFromRequest(req, authRes) {
    if (!authRes.is_admin) return req.body[0].caseIntID;
    return req.body[1]?.case_int_id || req.body[1]?.caseIntID || req.body[1]?.id || req.body[0].caseIntID;
}

exports.getSurveyAngleLock = catchAsync((req, res) => {
    console.log("Trying to get survey angle lock");
    if (!req.body) {
        res.status(400).send(genErrorObj(null, "Content can not be empty!"));
        return;
    }

    authenticate(req.body[0], [Auth.authLoginDetails, Auth.authCaseReadAccess, Auth.updateLastCommunication], (authErr, authRes, authFailReason) => {
        if (authErr) {
            res.status(500).send(genAuthErrorObj(authErr));
            return;
        }
        if (!authRes.success) {
            console.log(authFailReason);
            res.status(401).send(genAuthErrorObj(null, authFailReason));
            return;
        }

        const caseIntID = surveyCaseIntIdFromRequest(req, authRes);
        Case.getSurveyAngleLock(caseIntID, !authRes.is_admin, (err, data) => {
            if (err) {
                if (err.kind === "not_found") {
                    res.status(404).send(genErrorObj(err, `No case found with case int id of ${caseIntID}.`));
                } else {
                    res.status(500).send(genErrorObj(err, "Error getting survey angle lock with case int id " + caseIntID));
                }
            } else res.status(200).send(data);
        });
    });
});

exports.updateSurveyAngleLock = catchAsync((req, res) => {
    console.log("Trying to update survey angle lock");
    if (!req.body) {
        res.status(400).send(genErrorObj(null, "Content can not be empty!"));
        return;
    }

    authenticate(req.body[0], [Auth.authLoginDetails, Auth.authCaseWriteAndReadAccess, Auth.updateLastCommunication], (authErr, authRes, authFailReason) => {
        if (authErr) {
            res.status(500).send(genAuthErrorObj(authErr));
            return;
        }
        if (!authRes.success) {
            console.log(authFailReason);
            res.status(401).send(genAuthErrorObj(null, authFailReason));
            return;
        }

        const caseIntID = surveyCaseIntIdFromRequest(req, authRes);
        const locked = Boolean(req.body[1]?.survey_angle_locked);
        Case.updateSurveyAngleLock(caseIntID, locked, req.body[0].uuid, (err, data) => {
            if (err) {
                if (err.kind === "not_found") {
                    res.status(404).send(genErrorObj(err, `No case found with case int id of ${caseIntID}.`));
                } else {
                    res.status(500).send(genErrorObj(err, "Error updating survey angle lock with case int id " + caseIntID));
                }
            } else res.status(200).send(data);
        });
    });
});

```

## 5. Frontend Payloads

The webapp now calls:

```http
POST /case/survey-angle-lock/get
POST /case/survey-angle-lock/update
```

Bodies follow the existing SmartRPD array style:

```json
[
  { "machine_id": "...", "uuid": "...", "caseIntID": 3265 },
  { "case_int_id": 3265, "survey_angle_locked": true }
]
```

Survey angle changes continue to use the existing frontend/backend survey-angle save flow.
