# SmartRPD Overview — Mermaid Diagrams

Companion to `SmartRPD_Overview.mdj` (StarUML project file). Paste either block into
[mermaid.live](https://mermaid.live) or any Mermaid-aware markdown viewer (GitHub, VS Code, etc.)
to render immediately.

## Business capability map

```mermaid
flowchart LR
    Clinician(["Clinician / Dental Technician"])
    Backend(["External Backend<br/>(smartrpdai.com)"])

    UC1(["Login & Authenticate"])
    UC2(["Browse & Manage Case List"])
    UC3(["Filter Cases"])
    UC4(["Change Case Status"])
    UC5(["Create New Case"])
    UC6(["Upload Additional STL Files (1-4)"])
    UC7(["Design RPD (2D Annotation)"])
    UC8(["View 3D Jaw Model"])
    UC9(["Share Case via QR Code"])
    UC10(["View Case Dashboard"])
    UC11(["Generate Case Report"])
    UC12(["Review Version History"])
    UC13(["Chat & Notifications"])
    UC14(["Download Case Files (STL/OFF)"])
    Sync(["Sync with Backend API"])

    Clinician --> UC1
    Clinician --> UC2
    Clinician --> UC3
    Clinician --> UC4
    Clinician --> UC5
    Clinician --> UC6
    Clinician --> UC7
    Clinician --> UC8
    Clinician --> UC9
    Clinician --> UC10
    Clinician --> UC11
    Clinician --> UC12
    Clinician --> UC13
    Clinician --> UC14

    UC1 -.include.-> Sync
    UC2 -.include.-> Sync
    UC5 -.include.-> Sync
    UC7 -.include.-> Sync
    UC8 -.include.-> Sync
    UC10 -.include.-> Sync
    UC11 -.include.-> Sync
    UC12 -.include.-> Sync
    UC14 -.include.-> Sync
    Backend --> Sync
```

## Technical structure

```mermaid
flowchart TB
    subgraph PRES["Presentation Layer (static SPA, nginx / Docker)"]
        Login["Login<br/><small>login.js, authGuard.js</small>"]
        CaseList["Case List<br/><small>caseManagement.js</small>"]
        CaseCreate["Case Creation<br/><small>createCase.js</small>"]

        subgraph TWOD["2D Annotation"]
            Engine["2D Design Engine<br/><small>components*.js, annotation*.js</small>"]
            ExtraStl["Extra STL Preview<br/><small>preview3D.js</small>"]
            Clinical["Clinical Info<br/><small>clinicalInfo.js, caseNote.js</small>"]
            Notice["Noticeboard / Report Builder<br/><small>noticeboard.js</small>"]
            JawStruct["JawStruct Codec<br/><small>jawStructApi/Apply/Codec/Codes.js</small>"]
            InstrEdit["Instruction Editor<br/><small>instructionEditor.js</small>"]
        end

        Viewer3D["3D Viewer<br/><small>index.js, newControls.js</small>"]
        Dashboard["Dashboard<br/><small>dashboard.js</small>"]
        VerHist["Version History<br/><small>versionHistory.js</small>"]
        Shell["Shared Shell<br/><small>appSidebar, chat, notifications, accessibility, ThreeDMobile</small>"]
        ApiClient["API Client<br/><small>ApiClient.js</small>"]
        Crypt["Crypt (ID obfuscation)<br/><small>crypt.js</small>"]
    end

    subgraph PROTO["Prototype (unreleased)"]
        SortApp["Sort Case List (React)<br/><small>MUI / Radix, login screen only</small>"]
    end

    Backend[["External Backend API<br/>smartrpdai.com"]]
    QRLib[["qrcodejs (CDN)<br/>not yet in this branch"]]

    Login --> Backend
    CaseList --> Backend
    CaseCreate --> Backend
    JawStruct --> Backend
    Clinical --> Backend
    Viewer3D --> Backend
    Dashboard --> Backend
    VerHist --> Backend
    Shell --> Backend
    Notice --> Backend
    CaseList -.-> QRLib
    Viewer3D --> ApiClient --> Backend
    Viewer3D --> Crypt
    CaseList --> Crypt

    style Backend fill:#3a3d3a,stroke:#8f8a78,color:#fff
    style QRLib fill:#3a3d3a,stroke:#8f8a78,color:#fff
    style SortApp fill:#5b5f59,stroke:#8f8a78,color:#fff
```
