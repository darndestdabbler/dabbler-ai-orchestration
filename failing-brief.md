# Project Brief: Dennis CSV Parser Java

## Purpose
A learning project to understand the dabbler-ai-orchestration VS Code extension. Demonstrates a simple end-to-end workflow using Java and Maven modules.

## Users & Audience
- Learning and demonstration purposes only
- Sample repository for understanding the orchestrator workflow

## What It Must Do
1. **Read CSV File**: Accept a CSV file as input
2. **Deserialize to Java Objects**: Parse CSV data into Person objects
3. **Persist to Database**: Store Person records in an H2 database using JPA
4. **Query & Display**: Retrieve all Person records from the database and present them

## Out of Scope
- Production deployment considerations
- Distributed processing or scaling
- Advanced error recovery mechanisms
- Web UI (console output only)
- Complex data transformations or validations beyond basic CSV parsing

## Success Criteria
- Application successfully reads a CSV file
- Data is deserialized into Person objects without errors
- Records persist correctly to the database
- Records can be queried and displayed from the database
- All modules build and run independently with proper dependencies

## Solution Architecture

### Maven Modules
1. **person-model** - Contains the Person class and related model objects
2. **csv-deserializer** - Handles CSV parsing and deserialization to Person objects
3. **db-persistence** - Manages JPA/Hibernate persistence and queries using H2 database
4. **console-app** - Main entry point: orchestrates reading CSV, persisting, and displaying records

### Deployment
Single-tier console application (no production split needed for this learning project).

## Key Constraints
- Java 11 or later
- Maven 3.8+
- Simple, clear architecture suitable for learning purposes
