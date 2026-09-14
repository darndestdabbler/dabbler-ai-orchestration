1. Issue: Should show Dabbler Terminal Window when you execute start next session in the Copilot CLI directly
2. Issue: Should be an easy way to allow each user to select a default model for authoring and a default model for verifying
3. Issue: Use plain language in the Dabbler output window.  For example, what does "declaration was refused mean?"
4. Issue: when watcher sees no activity for a while, then dabbler needs to do something -- often just tell AI to continue or ask the human operator for assistance.
5. Issue: A framework bug:  deps  loads  feed  as  row["feed"] === undefined ? null : String(row["feed"]) , so an explicit JSON  null  becomes the string  "null"  and  check  then reports a feed nobody configured. I omit the key instead. It's an installed package, not source here, so I only report it.
6. Issue: Once a problem is resolved by AI, the human operator, or the framework, the Work Explorer (the underlying data) should remove the warning.
7. Issue: Work Explorer does not automatically refresh.
8. Issue: Should be able to open repos by right-clicking a choosing open in the Solution Explorer.
9. Issue: Should be able to right-click on the next session in Not Started and choose, start session -- once there is no other session in flight.
10. Issue: Why does Copilot prompt you to continue sessions that  it finished?  Is there a bug with the framework where it is supposed to terminate verification sessions but does not?
11. Issue: When issues  are raised by the framework and then resolved by AI, AI should inform the framework and the framework should indicate that the issue is resolved.
12. Issue: Many issues raised in the framework are addressed by AI; therefore, the framework seems a little alarmist in nature.  Rather than saying DEADLOCK in caps and making it seem like nothing can be done about it, the framework should use softer language to let the human know that AI was alerted regarding a deadlock, and it may be resolving the issue now.  Same thing for "close refused" -- better to tell the human that AI was alerted regarding any issue and that it may be resolving the issue.  And again, when AI resolves the issue, a green message should be displayed in the dabbler terminal indicating as such.
13. Issue: when there is an issue that requires human intervention but something that can be deferred -- like a repository without a remote, there should be a warning.  I think that the word "stopped" is too strong.  It suggests that the application terminated.  "paused" would be better.  And again, when the human provides a decision that allows resuming, there should be a green message indicating as such.
14. Issue: Solution Explorer Contract -- what is that?  Why does it say "not written yet"?  Why does the Contract tool tip say  "... it is written in Step 3?"  Why does the csv=model say "1/6 Plan and design"
15. Issue: The task list doesn't seem to be that helpful and doesn't seem to be updating. 
16. Issue: The "Declare" step isn't named very well.  Why not have "Register", "Plan", "Work 1: _____", "Work 2: ____" ..., "Verify", "Test", "Close"
17. Issue: Sometimes, messages are in the Work Explorer as information items or questions.  There should be (a) a tool tip that explains why it is there and what the human operator needs to do or decide.  Each item should always have a recommended path to resolve and remove the item.  The human operator should be able to dismiss the item somehow.  It is possible that the item could be dismissed by simply following AI's recommendation.
18. Issue: Need to handle local packages better
 - Probably default to local packages that get built when needed (local .m2 or .nuget directory)
 - Push to remote package repo only when needed and in consultation with human operator
 - Local packages should be automatically updated when code changes or new relevant code is fetched from a remote repo.  
 - So -- architecture suggestion (please review):
  a. for releases and release candidates, local packages might be 'bundled' into a smaller set of composite packages based upon the target architecture tier and server.  AI would work with the human operator on the bundling.  It should be documented in the project in an appropriate way.  For example, a project document could indicate what bundle the current project is part of.
  b. there might be a need for a solution repo that holds the solution documentation, as well as bundling information and serves to generate the release artifacts.