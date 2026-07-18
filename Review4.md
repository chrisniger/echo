You are a Senior AI Architect, Speech Recognition Engineer, NLP Engineer, and Full Stack Software Engineer.

Your task is to redesign Echo's Question Detection Engine so it becomes intelligent enough to understand interviews, meetings, coding assessments, technical discussions, presentations, and conversations.

DO NOT implement a simple keyword search.

The current implementation only detects obvious question words such as:

- What
- Why
- How
- When

This is insufficient.

Echo must become context-aware and capable of detecting questions even when no question mark or traditional question words exist.

Examples:

"Walk me through your experience."

"Tell me about yourself."

"Describe a difficult project."

"Suppose you were designing Twitter."

"Reverse a linked list."

"Design a scalable payment system."

"Explain dependency injection."

"Let's talk about Docker."

These are all requests that require an AI response.

Echo must recognize them automatically.

=========================================================
OBJECTIVE
=========================================================

Design and implement a modular Question Detection Engine.

The engine must determine:

1. Is this transcript requesting information from the user?

2. Should Echo generate an AI response?

3. What category of question is this?

4. How confident is Echo?

Only after those decisions should Echo send the transcript to the main AI model.

=========================================================
MULTI-LAYER DETECTION ENGINE
=========================================================

Implement the following pipeline.

Layer 1
Fast Rule Engine

Detect traditional questions.

Examples:

What
Why
How
When
Where
Who
Which
Can you
Could you
Would you
Will you
Do you
Did you
Have you

This should execute instantly.

---

Layer 2
Interview Pattern Recognition

Detect common interview phrases.

Examples:

Walk me through...

Tell me about...

Describe...

Explain...

Share...

Discuss...

Compare...

Suppose...

Imagine...

Let's say...

Give me an example...

Talk about...

Help me understand...

Provide...

Outline...

Write...

Implement...

Design...

Refactor...

Optimize...

Debug...

Reverse...

Build...

Create...

This list should be configurable.

Store patterns in a configuration file or database.

Allow administrators to add more patterns without modifying source code.

---

Layer 3
Context Memory

Do not analyze each sentence independently.

Understand conversation flow.

Example

Interviewer:

Tell me about your experience with Laravel.

User answers.

Interviewer:

Interesting...

Can you elaborate?

Although "Can you elaborate?" contains no technical keywords, Echo must understand it refers to Laravel.

Maintain rolling conversation context.

Suggested window:

Previous 30–60 transcript segments.

---

Layer 4
Semantic AI Classifier

Instead of relying only on rules,

send the transcript to a lightweight AI classifier.

Prompt example:

Determine whether the following transcript is requesting information from the user.

Return only JSON.

Example:

{
"isQuestion": true,
"confidence": 0.98,
"category": "Behavioral"
}

The classifier must support categories such as:

Behavioral

Technical

Coding

System Design

SQL

Architecture

DevOps

Security

Networking

Cloud

Database

Project Management

Meeting Action

Meeting Discussion

Presentation

General Discussion

Follow-up

Clarification

Greeting

Small Talk

Unknown

The classifier should use a very small prompt.

It should be extremely fast.

=========================================================
QUESTION CONFIDENCE
=========================================================

Every transcript should receive a confidence score.

Example

Walk me through...

Confidence 99%

Tell me about...

95%

Interesting...

12%

Continue...

35%

Only generate AI responses when confidence exceeds a configurable threshold.

Default threshold:

70%

=========================================================
SESSION MODE DETECTION
=========================================================

Echo should automatically determine the current session type.

Examples

Interview

Technical Interview

Behavioral Interview

Coding Assessment

System Design Interview

Meeting

Presentation

Training

Sales Call

Support Call

Consultation

Brainstorming

Code Review

Architecture Review

The detected mode should influence question detection.

Example:

"Walk me through..."

During Interview Mode

Confidence:

99%

During Presentation Mode

Confidence:

45%

=========================================================
QUESTION TYPE DETECTION
=========================================================

After determining that a transcript is a question,

classify it.

Examples

Behavioral

Technical

Coding

System Design

SQL

DevOps

Cloud

Architecture

Leadership

Communication

Meeting Action

Meeting Summary Request

Decision Request

Brainstorming

=========================================================
SMART PROMPT ROUTING
=========================================================

Each category should use its own optimized prompt template.

Examples

Coding

Generate code.

Behavioral

Generate STAR-based answer.

System Design

Generate architecture.

SQL

Generate SQL query.

Meeting

Generate concise answer.

=========================================================
TWO-STAGE AI
=========================================================

Implement two independent AI stages.

Stage 1

Fast classifier.

Very small.

Very inexpensive.

Returns only:

Question?

Confidence?

Category?

Stage 2

Only if Stage 1 determines the transcript requires an answer,

send the complete transcript and context to the primary AI model.

This reduces API cost.

Improves speed.

Improves accuracy.

=========================================================
SMART CONTEXT
=========================================================

When generating the final answer,

include:

Current transcript

Previous transcript

Conversation history

Uploaded CV

Job description

Additional Context

Uploaded Documents

Screenshots

OCR results

Detected session mode

Detected question category

Previous AI responses

=========================================================
FUTURE AI SUPPORT
=========================================================

The engine must be provider independent.

Support future integration with:

OpenAI

Claude

Gemini

DeepSeek

OpenRouter

Ollama

Custom local models

Changing providers should not require rewriting the Question Detection Engine.

=========================================================
PERFORMANCE
=========================================================

The engine must process transcript segments with minimal latency.

Target:

Question detection

<100ms

Question classification

<300ms

AI response generation

Streaming immediately.

=========================================================
SETTINGS
=========================================================

Create a new "Question Detection" section in Settings.

Allow users to configure:

Enable AI Question Detection

Confidence Threshold

Response Delay

Enable Context Memory

Context Window Size

Enable Behavioral Detection

Enable Coding Detection

Enable Meeting Detection

Enable System Design Detection

Enable SQL Detection

Enable Smart Follow-up Detection

Enable AI Classifier

Enable Rule Engine

=========================================================
LOGGING
=========================================================

Every transcript should record:

Transcript

Question Detected

Confidence

Category

Rule Matched

AI Classifier Result

Response Generated

Processing Time

This will help improve the engine over time.

=========================================================
GOAL
=========================================================

Do not simply make Echo detect question words.

Make Echo think like a human interviewer, technical recruiter, meeting assistant, and AI conversation analyst.

The final system should be modular, configurable, extensible, provider-independent, highly performant, and significantly more intelligent than a traditional keyword-based detector.
