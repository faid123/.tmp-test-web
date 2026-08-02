# Requirements Document

## Introduction

This document defines a proportionate Git-triggered user acceptance testing (UAT) deployment and production-release gate for the existing static JavaScript, HTML, and CSS SmartRPD web application. The feature extends the existing Jenkins and nginx deployment approach with an isolated UAT environment, automated verification, accessible stakeholder review, defect and regression handling, recorded approvals, and controlled production promotion.

## Glossary

- **UAT_Deployment_System**: The Jenkins-based delivery capability that verifies, deploys, records, and promotes a Source_Revision through UAT and production.
- **Source_Revision**: An immutable Git commit identifier selected for verification and deployment.
- **UAT_Trigger**: A configured Git branch or Git tag update that starts a UAT Pipeline_Run.
- **Pipeline_Run**: One recorded execution of automated checks and deployment activities for a Source_Revision.
- **Automated_Checks**: The configured non-interactive tests and production-mode build for the static application.
- **UAT_Environment**: An nginx-served location isolated from the Production_Environment and used for acceptance evaluation.
- **Production_Environment**: The nginx-served location used by production users.
- **Release_Candidate**: A Source_Revision that has passed Automated_Checks and has been deployed successfully to the UAT_Environment.
- **Technical_Approver**: An authorized person who evaluates Automated_Checks, deployment results, and technical testing evidence.
- **UAT_Approver**: An authorized stakeholder or clinical representative who evaluates the Release_Candidate against agreed UAT scenarios.
- **Technical_Approval**: A recorded approval from a Technical_Approver for one Release_Candidate.
- **Stakeholder_Clinical_Approval**: A recorded approval from a UAT_Approver for one Release_Candidate.
- **Sign_Off_Record**: An immutable approval record that identifies the exact Source_Revision, approver identity, approval type, decision, and recorded date and time.
- **UAT_Feedback**: A recorded observation, acceptance result, or Defect associated with a Release_Candidate.
- **UAT_Scenario**: An agreed acceptance procedure with an expected result for evaluating a Release_Candidate.
- **UAT_Instructions**: Directions that identify the UAT_Scenarios and the method for submitting UAT_Feedback.
- **Defect**: A recorded variance between expected and observed application behavior during technical testing or UAT.
- **Regression_Testing**: Re-execution of Automated_Checks affected by a Defect correction and UAT_Scenarios affected by the correction.
- **Production_Promotion**: Deployment of the approved Source_Revision to the Production_Environment.

## Requirements

### Requirement 1: Git-triggered isolated UAT deployment

**User Story:** As a release engineer, I want a Git update to deploy a verified revision to an isolated UAT server, so that evaluation occurs before production deployment.

#### Acceptance Criteria

1. WHEN a UAT_Trigger identifies a Source_Revision, THE UAT_Deployment_System SHALL start exactly one Pipeline_Run for that UAT_Trigger.
2. WHEN a Pipeline_Run starts, THE UAT_Deployment_System SHALL associate the Pipeline_Run with the exact Git commit identifier of the Source_Revision.
3. WHEN all Automated_Checks pass for a Source_Revision, THE UAT_Deployment_System SHALL deploy that Source_Revision to the UAT_Environment.
4. THE UAT_Deployment_System SHALL serve UAT_Environment content from an nginx location separate from the Production_Environment content location.
5. THE UAT_Deployment_System SHALL provide a UAT_Environment address distinct from the Production_Environment address.
6. WHEN a UAT deployment succeeds, THE UAT_Deployment_System SHALL record the UAT_Environment address and deployed Source_Revision in the Pipeline_Run.
7. WHEN a UAT deployment succeeds, THE UAT_Deployment_System SHALL assign a successful final status to the Pipeline_Run.
8. IF a UAT deployment fails, THEN THE UAT_Deployment_System SHALL retain the previously deployed Source_Revision and content in the UAT_Environment.
9. IF a UAT deployment fails, THEN THE UAT_Deployment_System SHALL retain the current Source_Revision and content in the Production_Environment.
10. IF a UAT deployment fails, THEN THE UAT_Deployment_System SHALL record the failed deployment status in the Pipeline_Run.

### Requirement 2: Automated release-candidate verification

**User Story:** As a technical approver, I want automated checks to run before UAT deployment, so that stakeholders evaluate a technically verified build.

#### Acceptance Criteria

1. WHEN a Pipeline_Run starts, THE UAT_Deployment_System SHALL execute the configured non-interactive tests for the associated Source_Revision before initiating the production-mode build.
2. WHEN the configured tests complete, THE UAT_Deployment_System SHALL record the test results in the Pipeline_Run.
3. WHEN the configured tests pass, THE UAT_Deployment_System SHALL execute the production-mode build for the same Source_Revision.
4. WHEN the production-mode build completes, THE UAT_Deployment_System SHALL record the build result in the Pipeline_Run.
5. WHEN the configured tests and production-mode build pass, THE UAT_Deployment_System SHALL permit UAT deployment for the same Source_Revision.
6. IF a configured test or production-mode build fails, THEN THE UAT_Deployment_System SHALL assign a failed final status to the Pipeline_Run.
7. IF a configured test or production-mode build lacks an explicit passing result, THEN THE UAT_Deployment_System SHALL retain the previously deployed Source_Revision and content in the UAT_Environment.
8. IF a configured test or production-mode build lacks an explicit passing result, THEN THE UAT_Deployment_System SHALL retain the current Source_Revision and content in the Production_Environment.
9. IF assignment of a final Pipeline_Run status encounters an internal error, THEN THE UAT_Deployment_System SHALL record the status-assignment error and retain the preceding Pipeline_Run status.

### Requirement 3: Stakeholder UAT access and feedback

**User Story:** As a UAT approver, I want access to the release candidate and a defined feedback channel, so that I can evaluate clinical and operational workflows.

#### Acceptance Criteria

1. WHEN a Release_Candidate becomes available, THE UAT_Deployment_System SHALL provide the UAT_Approver with the UAT_Environment address and exact Source_Revision.
2. WHEN a Release_Candidate becomes available, THE UAT_Deployment_System SHALL provide the UAT_Approver with UAT_Instructions for executing UAT_Scenarios and submitting UAT_Feedback.
3. WHILE a Release_Candidate is under UAT evaluation, THE UAT_Deployment_System SHALL identify the evaluated Source_Revision in the UAT_Environment or associated release information.
4. WHEN a UAT_Approver submits UAT_Feedback, THE UAT_Deployment_System SHALL associate the UAT_Feedback with the exact evaluated Source_Revision.
5. WHEN a UAT_Approver completes a UAT_Scenario, THE UAT_Deployment_System SHALL record the scenario identifier and result for the exact evaluated Source_Revision.
6. WHILE UAT_Feedback or a UAT_Scenario result is retained, THE UAT_Deployment_System SHALL preserve the association with the exact evaluated Source_Revision.
7. IF the UAT_Environment is unavailable during UAT evaluation, THEN THE UAT_Deployment_System SHALL record the interruption against the affected Pipeline_Run.

### Requirement 4: Defect correction and regression testing

**User Story:** As a development team member, I want UAT defects corrected and retested through the same delivery path, so that approvals apply to the corrected release candidate.

#### Acceptance Criteria

1. WHEN UAT_Feedback identifies a Defect, THE UAT_Deployment_System SHALL record the Defect against the exact evaluated Source_Revision.
2. WHEN a Defect correction is committed, THE UAT_Deployment_System SHALL identify the correction by a new Source_Revision.
3. WHEN a UAT_Trigger identifies the corrected Source_Revision, THE UAT_Deployment_System SHALL start a new Pipeline_Run for the corrected Source_Revision.
4. WHEN a Pipeline_Run starts for a corrected Source_Revision, THE UAT_Deployment_System SHALL identify the configured tests affected by the Defect correction.
5. WHEN a Pipeline_Run starts for a corrected Source_Revision, THE UAT_Deployment_System SHALL identify the UAT_Scenarios affected by the Defect correction.
6. WHEN the UAT_Deployment_System executes configured non-interactive tests for a corrected Source_Revision, THE UAT_Deployment_System SHALL include the affected configured tests in Regression_Testing before initiating the production-mode build.
7. WHEN the corrected Source_Revision is deployed to the UAT_Environment, THE UAT_Deployment_System SHALL require execution of the affected UAT_Scenarios as Regression_Testing.
8. WHEN Regression_Testing produces a result, THE UAT_Deployment_System SHALL record the regression result against the corrected Source_Revision.
9. IF Regression_Testing produces a failed result, THEN THE UAT_Deployment_System SHALL associate the failed result with the corrected Defect and corrected Source_Revision.

### Requirement 5: Separate immutable approval records

**User Story:** As a release manager, I want separate technical and stakeholder or clinical approvals recorded for the same revision, so that production readiness is auditable.

#### Acceptance Criteria

1. WHEN a Technical_Approver submits a technical decision, THE UAT_Deployment_System SHALL create an immutable Sign_Off_Record for the exact evaluated Source_Revision and Technical_Approval.
2. WHEN a UAT_Approver submits a stakeholder or clinical decision, THE UAT_Deployment_System SHALL create a separate immutable Sign_Off_Record for the exact evaluated Source_Revision and Stakeholder_Clinical_Approval.
3. THE UAT_Deployment_System SHALL include the exact Source_Revision, approver identity, approval type, decision, and recorded date and time in each Sign_Off_Record.
4. WHEN a Sign_Off_Record is created, THE UAT_Deployment_System SHALL retain the Sign_Off_Record after the associated Pipeline_Run completes.
5. WHEN an authorized release participant requests release evidence, THE UAT_Deployment_System SHALL provide the Sign_Off_Records and Pipeline_Run results for the specified Source_Revision.
6. IF a new Source_Revision replaces an evaluated Source_Revision, THEN THE UAT_Deployment_System SHALL classify approvals for the replaced Source_Revision as inapplicable to the new Source_Revision.

### Requirement 6: Controlled production promotion

**User Story:** As a release manager, I want production promotion blocked until both approvals exist for the exact release candidate, so that only accepted revisions reach production.

#### Acceptance Criteria

1. WHILE Technical_Approval or Stakeholder_Clinical_Approval is absent for the exact Source_Revision requested for Production_Promotion, THE UAT_Deployment_System SHALL retain the current Source_Revision and content in the Production_Environment.
2. WHEN Technical_Approval and Stakeholder_Clinical_Approval are recorded for the exact same Source_Revision, THE UAT_Deployment_System SHALL classify that Source_Revision as eligible for Production_Promotion.
3. WHEN Production_Promotion is requested for an eligible Source_Revision, THE UAT_Deployment_System SHALL deploy that approved Source_Revision to the Production_Environment.
4. WHEN Production_Promotion succeeds, THE UAT_Deployment_System SHALL record the deployed Source_Revision and successful promotion result.
5. IF the requested Source_Revision differs from the Source_Revision in either required Sign_Off_Record, THEN THE UAT_Deployment_System SHALL record a blocked Production_Promotion result and retain the current Source_Revision and content in the Production_Environment.
6. IF Production_Promotion fails, THEN THE UAT_Deployment_System SHALL record the failed promotion result and retain the current Source_Revision and content in the Production_Environment.