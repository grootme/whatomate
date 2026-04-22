
### Summary of Changes and Rationale

The core objective of these changes is to provide a flexible and extensible architecture that supports both Meta's WhatsApp Cloud API and the `whatsmeow` library for WhatsApp communication. This allows users to choose their preferred method for connecting to WhatsApp, including QR code login for `whatsmeows`.

Here's a breakdown of the key modifications:

1.  **`whatsapp.ClientInterface` Definition (`pkg/whatsapp/client_interface.go`):**
    *   **Change:** A Go interface `ClientInterface` was created. This interface defines a standard contract for all WhatsApp client operations, such as sending messages, managing accounts, uploading media, and handling sessions.
    *   **Rationale:** This is a fundamental abstraction. By depending on an interface rather than concrete implementations, the application becomes loosely coupled. This allows for easy swapping or addition of new WhatsApp providers (like `whatsmeow`) without altering the core application logic. The `UploadProfilePicture` method was also added to this interface.

2.  **`MetaClientAdapter` (`pkg/whatsapp/meta_client_adapter.go`):**
    *   **Change:** An adapter was developed to wrap the existing `whatsapp.Client` (which is specific to Meta's Cloud API). This adapter implements the `ClientInterface`.
    *   **Rationale:** This bridges the gap between the existing Meta API integration and the new `ClientInterface`. It ensures that the current functionality remains accessible through the new abstraction layer.

3.  **`WhatsmeowClientAdapter` (`pkg/whatsapp/whatsmeow_client_adapter.go`):**
    *   **Change:** A new adapter was created to implement the `ClientInterface` using the `go.mau.fi/whatsmeow` library. This includes logic for session management (`StartSession`) and handling QR codes, as well as basic text message sending.
    *   **Rationale:** This provides the `whatsmeow` integration. It allows the application to connect to WhatsApp using `whatsmeow`'s features, including QR code scanning for login, which is distinct from Meta's token-based authentication. The `go.mau.fi/whatsmeow` dependency was added to `go.mod`.

4.  **`ClientFactory` (`pkg/whatsapp/factory.go`):**
    *   **Change:** A factory pattern was implemented to create instances of `ClientInterface`.
    *   **Rationale:** This factory abstracts the instantiation logic. It decides which adapter (`MetaClientAdapter` or `WhatsmeowClientAdapter`) to provide based on account configuration (specifically `ClientType`).

5.  **`MultiClientProvider` (`pkg/whatsapp/multi_client_provider.go`):**
    *   **Change:** This provider implements `ClientInterface` and acts as a central dispatcher. It uses the `ClientFactory` to obtain the correct adapter and delegate calls based on the `WhatsAppAccount.ClientType`.
    *   **Rationale:** This provider serves as the main entry point for all WhatsApp-related operations within the application. It hides the complexity of managing multiple client types, allowing other parts of the application to work with a single, unified interface.

6.  **`WhatsAppAccount` Model Enhancements (`internal/models/models.go`):**
    *   **Change:** The `models.WhatsAppAccount` struct was updated to include:
        *   `ClientType` (string, defaulting to 'meta'): To specify which provider the account uses.
        *   `SessionData` (JSONB): To store persistent session information required by `whatsmeow`.
        *   `QRCode` (string): To store the QR code data for `whatsmeow` pairing.
    *   **Rationale:** These fields are crucial for managing accounts across different WhatsApp providers and storing provider-specific configuration and state.

7.  **`App` Struct Update (`internal/handlers/app.go`):**
    *   **Change:** The `WhatsApp` field in the `handlers.App` struct was changed from the concrete `*whatsapp.Client` to the interface `whatsapp.ClientInterface`.
    *   **Rationale:** This enables dependency injection of the `MultiClientProvider` (which implements `ClientInterface`) into the application's core logic, ensuring that handlers can work with any WhatsApp client implementation through the common interface.

8.  **Initialization in `cmd/whatomate/main.go`:**
    *   **Change:** The `main` function was modified to:
        *   Initialize `whatsmeow`'s `sqlstore.Container` using the existing PostgreSQL database connection. This is necessary for `whatsmeow` to persist session data.
        *   Instantiate the `whatsapp.MultiClientProvider`, passing the logger and the `sqlstore.Container`.
        *   Assign the `MultiClientProvider` to `app.WhatsApp`.
    *   **Rationale:** This ensures that the application starts with a properly configured WhatsApp client provider, capable of managing connections to different WhatsApp services.

9.  **Handler Refactoring Across the Project:**
    *   **Change:** Numerous handler functions (in `accounts.go`, `messages.go`, `business_profile.go`, `campaigns.go`, `catalog.go`, `contacts.go`, `flows.go`, `media.go`, `meta_analytics.go`, `templates.go`, and `internal/worker/worker.go`) were modified. These changes include:
        *   Replacing direct calls to `whatsapp.Client` methods and `a.toWhatsAppAccount(account)` conversions with direct calls to `a.WhatsApp` (the `ClientInterface`), passing the `*models.WhatsAppAccount` object.
        *   Updating handlers to correctly process and use the new `ClientType` field in `WhatsAppAccount`.
        *   Adding the `QRCode` field to `AccountResponse` to display QR codes for `whatsmeow` accounts.
        *   Adding a new endpoint (`POST /api/accounts/{id}/start-session`) to specifically manage `whatsmeow` sessions (e.g., QR code generation).
    *   **Rationale:** This comprehensive refactoring ensures that all existing WhatsApp functionalities now utilize the unified `ClientInterface`, making the system compatible with both Meta Cloud API and `whatsmeow` and preparing it for further expansion.

### Architectural Overview

The application follows a layered, modular architecture with a focus on flexibility and extensibility, particularly for handling external service integrations like WhatsApp.

1.  **Presentation Layer (API Handlers):**
    *   Located in the `internal/handlers` package, these components expose RESTful APIs for the frontend and other services.
    *   They abstract business logic and interact with the `App` struct for data access and service operations.
    *   Key handlers include those for managing accounts, contacts, messages, flows, and campaigns.

2.  **Application Core (`App` struct):**
    *   The `App` struct in `internal/handlers/app.go` is the central orchestrator for request handling.
    *   It holds dependencies like the database (`gorm.DB`), Redis (`redis.Client`), logger (`logf.Logger`), configuration (`config.Config`), WebSocket hub (`websocket.Hub`), queue (`queue.Queue`), and importantly, the `whatsapp.ClientInterface`.
    *   By depending on an interface (`whatsapp.ClientInterface`), the `App` struct is decoupled from the specifics of any single WhatsApp provider.

3.  **WhatsApp Abstraction Layer (`pkg/whatsapp`):**
    *   This package is crucial for managing WhatsApp integrations. It consists of:
        *   **`ClientInterface`:** The high-level contract for WhatsApp operations.
        *   **Adapters:** Concrete implementations (`MetaClientAdapter`, `WhatsmeowClientAdapter`) that translate `ClientInterface` calls into provider-specific SDK calls.
        *   **Factory & Provider (`ClientFactory`, `MultiClientProvider`):** Components responsible for creating and selecting the correct adapter at runtime based on account configuration. This is the core of the multi-provider strategy.

4.  **Data Access Layer (`internal/database` and `internal/models`):**
    *   **`internal/database`:** Manages database connections (PostgreSQL, Redis) and migrations. It provides functions to establish connections and ensures the database schema is up-to-date.
    *   **`internal/models`:** Defines the data structures (GORM models) that represent entities in the application, including `WhatsAppAccount`, `Contact`, `Message`, etc. These models now include fields to support different WhatsApp provider configurations.

5.  **Worker Layer (`internal/worker`):**
    *   Handles background processing tasks, such as sending bulk messages, processing incoming messages, and managing campaign statistics.
    *   Workers utilize the `whatsapp.ClientInterface` to send messages and interact with WhatsApp services.

6.  **Configuration (`internal/config`):**
    *   Manages application settings loaded from `config.toml` and environment variables, including database credentials, API keys, and WhatsApp-specific settings.

7.  **Utilities:**
    *   Packages like `crypto` for encryption, `queue` for background job processing, and `websocket` for real-time communication are utilized to support various application features.

**Key Architectural Principles Applied:**

*   **Adapter Pattern:** Used to make incompatible interfaces (like the existing `whatsapp.Client` and the `go.mau.fi/whatsmeow` library) compatible with a common interface (`ClientInterface`).
*   **Dependency Inversion Principle (DIP):** High-level modules (handlers) depend on abstractions (`ClientInterface`) rather than low-level concrete implementations.
*   **Dependency Injection:** The `App` struct receives its dependencies (including the `whatsapp.ClientInterface`) during initialization, promoting loose coupling and testability.
*   **Factory Pattern:** Used for abstracting the creation of `ClientInterface` implementations.
*   **Separation of Concerns:** Each package and component has a distinct responsibility, contributing to maintainability and scalability.

This architecture is designed to be robust and adaptable, allowing for the seamless integration of new WhatsApp providers or other external services in the future.
