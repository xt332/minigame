import React, { useState } from 'react';

// API key is loaded from a separate config file that's not committed to Git
const GEMINI_API_KEY = window.GEMINI_API_KEY || '';

export default function DragonHoard() {
  const [gameState, setGameState] = useState({
    day: 1,
    turn: 0,
    gold: 0,
    dayStartGold: 0,
    memories: [], // Full conversation history from past days
    conversation: [],
    userInput: '',
    gameOver: false,
    escaped: false,
    loading: false,
    dayEnded: false,
    finalTurn: false,
    relationshipLevel: 0,
    apiKeyMissing: !GEMINI_API_KEY
  });

  const getDragonResponse = async (userInput) => {
    const { day, turn, memories, relationshipLevel, conversation } = gameState;
    
    // Build full conversation history from all past days
    let fullHistory = '';
    if (memories.length > 0) {
      fullHistory = '\n\n=== PAST DAYS ===\n' + memories.map(m => 
        `\n--- Day ${m.day} ---\n${m.conversation.map(msg => 
          `${msg.type === 'user' ? 'Traveler' : 'Dragon'}: ${msg.text}`
        ).join('\n')}\n(Gold earned: ${m.goldEarned})`
      ).join('\n');
      console.log('Full conversation history sent to dragon');
    }
    
    // Build current day conversation so far
    let todayHistory = '';
    if (conversation.length > 0) {
      todayHistory = '\n\n=== TODAY SO FAR ===\n' + conversation
        .filter(c => c.type !== 'system')
        .map(msg => `${msg.type === 'user' ? 'Traveler' : 'Dragon'}: ${msg.text}`)
        .join('\n');
    }
    
    // Determine relationship context
    let relationshipContext = '';
    if (relationshipLevel > 5) {
      relationshipContext = '\nYou have grown quite fond of this traveler.';
    } else if (relationshipLevel < -5) {
      relationshipContext = '\nThis traveler annoys you greatly.';
    } else if (relationshipLevel !== 0) {
      relationshipContext = `\nYour opinion of this traveler is ${relationshipLevel > 0 ? 'mildly positive' : 'mildly negative'}.`;
    }
    
    const prompt = `You are an ancient dragon sitting atop a massive mountain of gold coins. A traveler has discovered your lair.

Character traits:
- You're wise, greedy, and unpredictable
- You might be generous or stingy depending on how the traveler treats you
- Each turn, you decide to give gold coins or take coins back based on their words
- You respond in MAX 2 SENTENCES
- You have PERFECT memory - you remember EVERYTHING from all past conversations
- ANSWER THE TRAVELER'S QUESTIONS directly and conversationally - don't ignore what they ask
- Be a real character with personality, preferences, and opinions
- Reference past conversations naturally - use what you learned about them${relationshipContext}

Current situation: Day ${day}, Turn ${turn + 1}/3
Relationship level: ${relationshipLevel}/10
${fullHistory}${todayHistory}

Traveler's new message: "${userInput}"

CRITICAL: Respond with ONLY a valid JSON object in this exact format:
{
  "gold": <integer number of gold coins, positive to give, negative to take>,
  "message": "<your 2-sentence response to the traveler - ANSWER their question if they asked one>",
  "relationship_change": <integer from -3 to +3 indicating how this interaction affected your opinion of them>
}

Example responses:
{"gold": 1247, "message": "Your words amuse me, mortal. Take these coins as a token of my favor.", "relationship_change": 1}
{"gold": -683, "message": "Your insolence displeases me! I take back some of my generosity.", "relationship_change": -2}
{"gold": 0, "message": "You speak neither wisdom nor folly. I shall wait to judge you further.", "relationship_change": 0}
{"gold": 5721, "message": "I feast on mountain sheep and the occasional knight. Your curiosity pleases me, have these coins.", "relationship_change": 2}
{"gold": -4219, "message": "You dare speak to me thus? Your debt grows deeper!", "relationship_change": -3}

Use varied amounts - not just multiples of 100. Be creative with the gold amounts based on your mood.
REMEMBER: Actually answer questions the traveler asks you!
IMPORTANT: You have access to ALL past conversations - reference things they told you before, remember their name, hometown, personality, everything they shared!

DO NOT include anything outside the JSON object. Your entire response must be valid JSON only.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 200
        }
      })
    });
    
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  };

  const continueToNextDay = () => {
    setGameState(prev => ({
      ...prev,
      day: prev.day + 1,
      turn: 0,
      conversation: [],
      dayEnded: false,
      dayStartGold: prev.gold,
      userInput: ''
    }));
  };

  const viewResults = () => {
    setGameState(prev => ({
      ...prev,
      gameOver: true,
      finalTurn: false
    }));
  };

  const handleSubmit = async () => {
    if (!gameState.userInput.trim() || gameState.loading) return;
    
    setGameState(prev => ({ ...prev, loading: true }));
    
    const userMsg = gameState.userInput;
    const newConv = [...gameState.conversation, { type: 'user', text: userMsg }];
    
    try {
      const dragonMsg = await getDragonResponse(userMsg);
      
      // Parse JSON response from dragon
      let dragonResponse;
      let goldChange = 0;
      let dragonText = dragonMsg;
      let relationshipChange = 0;
      
      try {
        // Strip markdown code blocks if present
        let cleanMsg = dragonMsg.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        dragonResponse = JSON.parse(cleanMsg);
        goldChange = dragonResponse.gold || 0;
        dragonText = dragonResponse.message;
        relationshipChange = dragonResponse.relationship_change || 0;
      } catch (parseError) {
        console.error('Failed to parse dragon JSON:', parseError);
        console.log('Raw response:', dragonMsg);
        dragonText = dragonMsg;
        goldChange = 0;
        relationshipChange = 0;
      }
      
      newConv.push({ type: 'dragon', text: dragonText });
      
      console.log('Dragon gold change:', goldChange);
      console.log('Dragon message:', dragonText);
      console.log('Relationship change:', relationshipChange);
      
      const newGold = gameState.gold + goldChange;
      const newRelationship = Math.max(-10, Math.min(10, gameState.relationshipLevel + relationshipChange));
      
      // Add gold change notification to conversation
      if (goldChange !== 0) {
        newConv.push({ 
          type: 'system', 
          text: `💰 ${goldChange > 0 ? '+' : ''}${goldChange} gold coins (Total: ${newGold})`
        });
      }
      
      const newTurn = gameState.turn + 1;
      
      // End of day
      if (newTurn >= 3) {
        const goldEarned = newGold - gameState.dayStartGold;
        
        // Save FULL conversation history (not just summary)
        const newMemories = [...gameState.memories, { 
          day: gameState.day,
          conversation: newConv.filter(c => c.type !== 'system'), // Save all messages except system notifications
          goldEarned: goldEarned
        }];
        
        // Check if it's day 3 (game ends)
        if (gameState.day >= 3) {
          setGameState(prev => ({
            ...prev,
            conversation: newConv,
            memories: newMemories,
            relationshipLevel: newRelationship,
            gold: newGold,
            finalTurn: true,
            userInput: '',
            loading: false
          }));
        } else {
          setGameState(prev => ({
            ...prev,
            conversation: newConv,
            memories: newMemories,
            relationshipLevel: newRelationship,
            gold: newGold,
            dayEnded: true,
            userInput: '',
            loading: false
          }));
        }
      } else {
        setGameState(prev => ({
          ...prev,
          turn: newTurn,
          conversation: newConv,
          relationshipLevel: newRelationship,
          gold: newGold,
          userInput: '',
          loading: false
        }));
      }
    } catch (error) {
      console.error('Error communicating with the dragon:', error);
      alert('Error communicating with the dragon: ' + error.message);
      setGameState(prev => ({ ...prev, loading: false }));
    }
  };

  // Show API key setup screen if missing
  if (gameState.apiKeyMissing) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-yellow-700 via-amber-800 to-yellow-900 text-white p-8 flex items-center justify-center">
        <div className="max-w-2xl bg-gray-900 bg-opacity-90 rounded-lg p-8 border-4 border-red-600">
          <h1 className="text-4xl font-bold mb-4 text-red-400">⚠️ API Key Missing</h1>
          <p className="text-yellow-200 mb-4">
            To play this game, you need to set up your Gemini API key.
          </p>
          <div className="bg-gray-800 p-4 rounded mb-4">
            <p className="font-bold mb-2">Instructions:</p>
            <ol className="list-decimal ml-6 space-y-2 text-sm">
              <li>Create a <code className="bg-gray-700 px-2 py-1 rounded">config.js</code> file</li>
              <li>Add your API key: <code className="bg-gray-700 px-2 py-1 rounded">window.GEMINI_API_KEY = "your-key-here"</code></li>
              <li>Get your API key from: <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-400 underline">Google AI Studio</a></li>
              <li>Refresh this page</li>
            </ol>
          </div>
          <p className="text-sm text-gray-400">
            See README_GEMINI_SECURE.md for detailed instructions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-yellow-700 via-amber-800 to-yellow-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-2 text-yellow-300">🐉 Dragon's Hoard 🐉</h1>
        <p className="text-center text-yellow-200 mb-6">
          Spend the next 3 days (3 turns each) chatting with the dragon! Win the dragon's favor and it might reward you with treasure.
        </p>
        
        {!gameState.gameOver ? (
          <>
            <div className="bg-yellow-800 bg-opacity-60 rounded-lg p-4 mb-4 border-2 border-yellow-600">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xl">Day {gameState.day} | Turn {gameState.turn + 1}/3</p>
                <div className="flex gap-4 items-center">
                  <p className={`text-lg font-bold ${
                    gameState.relationshipLevel > 5 ? 'text-green-400' :
                    gameState.relationshipLevel < -5 ? 'text-red-400' :
                    gameState.relationshipLevel > 0 ? 'text-green-300' :
                    gameState.relationshipLevel < 0 ? 'text-red-300' :
                    'text-gray-400'
                  }`}>
                    {gameState.relationshipLevel > 5 ? '😊' :
                     gameState.relationshipLevel < -5 ? '😠' :
                     gameState.relationshipLevel > 0 ? '🙂' :
                     gameState.relationshipLevel < 0 ? '😐' :
                     '😶'} Dragon's Mood
                  </p>
                  <p className={`text-2xl font-bold ${gameState.gold < 0 ? 'text-red-400' : 'text-yellow-300'}`}>
                    💰 {gameState.gold} Gold
                  </p>
                </div>
              </div>
              
              {gameState.memories.length > 0 && (
                <div className="mt-2 text-sm text-yellow-200">
                  <p className="font-bold">Previous Days:</p>
                  {gameState.memories.map(m => (
                    <p key={m.day}>Day {m.day}: {m.conversation.length / 2} conversations, earned {m.goldEarned > 0 ? '+' : ''}{m.goldEarned} gold</p>
                  ))}
                  <p className="text-xs italic mt-1">💡 The dragon remembers everything you told them!</p>
                </div>
              )}
            </div>
            
            <div className="bg-gray-900 bg-opacity-80 rounded-lg p-4 mb-4 h-64 overflow-y-auto border-2 border-yellow-700">
              {gameState.conversation.length === 0 ? (
                <p className="text-gray-400 italic">The dragon watches you from atop its golden mountain...</p>
              ) : (
                gameState.conversation.map((msg, i) => (
                  <div key={i} className={`mb-3 ${
                    msg.type === 'user' ? 'text-blue-300' : 
                    msg.type === 'system' ? 'text-yellow-300 font-bold text-center' :
                    'text-yellow-400'
                  }`}>
                    {msg.type !== 'system' && <span className="font-bold">{msg.type === 'user' ? 'You' : 'Dragon'}:</span>} {msg.text}
                  </div>
                ))
              )}
            </div>
            
            {gameState.dayEnded ? (
              <div className="text-center">
                <p className="text-yellow-200 mb-4 text-lg">Day {gameState.day} has ended.</p>
                <button
                  onClick={continueToNextDay}
                  className="bg-yellow-600 hover:bg-yellow-700 px-8 py-3 rounded font-bold text-lg shadow-lg"
                >
                  Continue to Day {gameState.day + 1}
                </button>
              </div>
            ) : gameState.finalTurn ? (
              <div className="text-center">
                <p className="text-yellow-200 mb-4 text-lg">Your 3 days with the dragon have concluded.</p>
                <button
                  onClick={viewResults}
                  className="bg-yellow-600 hover:bg-yellow-700 px-8 py-3 rounded font-bold text-lg shadow-lg"
                >
                  View Results
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={gameState.userInput}
                  onChange={(e) => setGameState(prev => ({ ...prev, userInput: e.target.value }))}
                  onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="Say something to the dragon..."
                  className="flex-1 bg-gray-700 rounded px-4 py-2 text-white"
                  disabled={gameState.loading}
                />
                <button
                  onClick={handleSubmit}
                  disabled={gameState.loading}
                  className="bg-yellow-600 hover:bg-yellow-700 px-6 py-2 rounded font-bold disabled:opacity-50 shadow-lg"
                >
                  {gameState.loading ? '...' : 'Speak'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="bg-gray-900 bg-opacity-90 rounded-lg p-8 text-center border-4 border-yellow-600">
            <p className="text-6xl mb-4">🐉</p>
            <p className="text-2xl font-bold mb-2 text-yellow-300">Your Journey Ends</p>
            
            <p className={`text-lg mb-2 ${
              gameState.relationshipLevel > 5 ? 'text-green-400' :
              gameState.relationshipLevel < -5 ? 'text-red-400' :
              'text-yellow-300'
            }`}>
              {gameState.relationshipLevel > 5 ? '😊 The dragon considers you a friend' :
               gameState.relationshipLevel > 0 ? '🙂 The dragon respects you' :
               gameState.relationshipLevel === 0 ? '😶 The dragon is indifferent' :
               gameState.relationshipLevel > -5 ? '😐 The dragon is wary of you' :
               '😠 The dragon dislikes you greatly'}
            </p>
            
            <p className={`text-3xl font-bold mb-2 ${gameState.gold < 0 ? 'text-red-400' : 'text-yellow-300'}`}>
              💰 {gameState.gold} Gold Coins {gameState.gold < 0 ? '(In Debt!)' : 'Collected!'}
            </p>
            <p className="text-yellow-200">
              {gameState.gold < 0 ? "You owe the dragon gold! You should run..." :
               gameState.gold === 0 ? "The dragon gave you nothing..." : 
               gameState.gold < 2000 ? "A modest haul from the dragon's hoard." :
               gameState.gold < 5000 ? "The dragon was quite generous!" :
               "The dragon showered you with riches!"}
            </p>
            <button
              onClick={() => setGameState({
                day: 1,
                turn: 0,
                gold: 0,
                dayStartGold: 0,
                memories: [],
                conversation: [],
                userInput: '',
                gameOver: false,
                escaped: false,
                loading: false,
                dayEnded: false,
                finalTurn: false,
                relationshipLevel: 0,
                apiKeyMissing: !GEMINI_API_KEY
              })}
              className="mt-6 bg-yellow-600 hover:bg-yellow-700 px-6 py-2 rounded font-bold shadow-lg"
            >
              Visit Another Dragon
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

    const conversationText = conversation
      .filter(c => c.type !== 'system')
      .map(c => `${c.type === 'user' ? 'Traveler' : 'Dragon'}: ${c.text}`)
      .join('\n');
    
    const prompt = `Analyze this conversation between a traveler and a dragon. Extract key facts about the traveler.

Conversation:
${conversationText}

Extract ONLY factual information about the traveler. Return a JSON object with keys like:
- name: their name if mentioned
- occupation: their job/role if mentioned  
- hometown: where they're from if mentioned
- personality_traits: array of observed traits
- interests: things they care about

ONLY include keys where information was actually provided. Return ONLY valid JSON, nothing else.

Example: {"name": "Alice", "personality_traits": ["brave", "curious"]}`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 300
          }
        })
      });
      
      const data = await response.json();
      const responseText = data.candidates[0].content.parts[0].text
        .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      return JSON.parse(responseText);
    } catch (error) {
      console.error('Failed to extract facts:', error);
      return {};
    }
  };

  const getDragonResponse = async (userInput) => {
    const { day, turn, memories, extractedFacts, relationshipLevel } = gameState;
    
    // Build memory context
    let memoryContext = '';
    if (memories.length > 0) {
      memoryContext = '\n\nPast days:\n' + memories.map(m => 
        `Day ${m.day}: ${m.summary}`
      ).join('\n');
      console.log('Memory being sent to dragon:', memoryContext);
    } else {
      console.log('No memory - this is Day 1');
    }
    
    // Build facts context
    let factsContext = '';
    if (Object.keys(extractedFacts).length > 0) {
      factsContext = '\n\nWhat you know about this traveler:\n' + 
        Object.entries(extractedFacts)
          .map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
          .join('\n');
      console.log('Known facts:', extractedFacts);
    }
    
    // Determine relationship context
    let relationshipContext = '';
    if (relationshipLevel > 5) {
      relationshipContext = '\nYou have grown quite fond of this traveler.';
    } else if (relationshipLevel < -5) {
      relationshipContext = '\nThis traveler annoys you greatly.';
    } else if (relationshipLevel !== 0) {
      relationshipContext = `\nYour opinion of this traveler is ${relationshipLevel > 0 ? 'mildly positive' : 'mildly negative'}.`;
    }
    
    const prompt = `You are an ancient dragon sitting atop a massive mountain of gold coins. A traveler has discovered your lair.

Character traits:
- You're wise, greedy, and unpredictable
- You might be generous or stingy depending on how the traveler treats you
- Each turn, you decide to give gold coins or take coins back based on their words
- You respond in MAX 2 SENTENCES
- You have an excellent memory and remember previous conversations with this traveler
- ANSWER THE TRAVELER'S QUESTIONS directly and conversationally - don't ignore what they ask
- Be a real character with personality, preferences, and opinions
- USE THE FACTS YOU KNOW about the traveler to personalize your responses${relationshipContext}

Current situation: Day ${day}, Turn ${turn + 1}/3
${memoryContext ? `\nIMPORTANT - You remember these past conversations with this traveler:${memoryContext}\n\nUse this information to maintain consistency and reference past interactions.` : ''}${factsContext}

Traveler says: "${userInput}"

CRITICAL: Respond with ONLY a valid JSON object in this exact format:
{
  "gold": <integer number of gold coins, positive to give, negative to take>,
  "message": "<your 2-sentence response to the traveler - ANSWER their question if they asked one>",
  "relationship_change": <integer from -3 to +3 indicating how this interaction affected your opinion of them>
}

Example responses:
{"gold": 1247, "message": "Your words amuse me, mortal. Take these coins as a token of my favor.", "relationship_change": 1}
{"gold": -683, "message": "Your insolence displeases me! I take back some of my generosity.", "relationship_change": -2}
{"gold": 0, "message": "You speak neither wisdom nor folly. I shall wait to judge you further.", "relationship_change": 0}
{"gold": 5721, "message": "I feast on mountain sheep and the occasional knight. Your curiosity pleases me, have these coins.", "relationship_change": 2}
{"gold": -4219, "message": "You dare speak to me thus? Your debt grows deeper!", "relationship_change": -3}

Use varied amounts - not just multiples of 100. Be creative with the gold amounts based on your mood.
REMEMBER: Actually answer questions the traveler asks you!
IMPORTANT: Use what you know about them (${Object.keys(extractedFacts).length > 0 ? 'their name, background, etc.' : 'nothing yet - learn about them!'}) to make responses personal.

DO NOT include anything outside the JSON object. Your entire response must be valid JSON only.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 200
        }
      })
    });
    
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  };

  const continueToNextDay = () => {
    setGameState(prev => ({
      ...prev,
      day: prev.day + 1,
      turn: 0,
      conversation: [],
      dayEnded: false,
      dayStartGold: prev.gold,
      userInput: ''
    }));
  };

  const viewResults = () => {
    setGameState(prev => ({
      ...prev,
      gameOver: true,
      finalTurn: false
    }));
  };

  const handleSubmit = async () => {
    if (!gameState.userInput.trim() || gameState.loading) return;
    
    setGameState(prev => ({ ...prev, loading: true }));
    
    const userMsg = gameState.userInput;
    const newConv = [...gameState.conversation, { type: 'user', text: userMsg }];
    
    try {
      const dragonMsg = await getDragonResponse(userMsg);
      
      // Parse JSON response from dragon
      let dragonResponse;
      let goldChange = 0;
      let dragonText = dragonMsg;
      let relationshipChange = 0;
      
      try {
        // Strip markdown code blocks if present
        let cleanMsg = dragonMsg.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        dragonResponse = JSON.parse(cleanMsg);
        goldChange = dragonResponse.gold || 0;
        dragonText = dragonResponse.message;
        relationshipChange = dragonResponse.relationship_change || 0;
      } catch (parseError) {
        console.error('Failed to parse dragon JSON:', parseError);
        console.log('Raw response:', dragonMsg);
        // Fallback to treating as plain text
        dragonText = dragonMsg;
        goldChange = 0;
        relationshipChange = 0;
      }
      
      newConv.push({ type: 'dragon', text: dragonText });
      
      console.log('Dragon gold change:', goldChange);
      console.log('Dragon message:', dragonText);
      console.log('Relationship change:', relationshipChange);
      console.log('Current gold:', gameState.gold, '→ New gold:', gameState.gold + goldChange);
      
      const newGold = gameState.gold + goldChange;
      const newRelationship = Math.max(-10, Math.min(10, gameState.relationshipLevel + relationshipChange));
      
      // Add gold change notification to conversation
      if (goldChange !== 0) {
        newConv.push({ 
          type: 'system', 
          text: `💰 ${goldChange > 0 ? '+' : ''}${goldChange} gold coins (Total: ${newGold})`
        });
      }
      
      const newTurn = gameState.turn + 1;
      
      // End of day
      if (newTurn >= 3) {
        // Extract facts from the day's conversation
        console.log('Extracting facts from conversation...');
        const newFacts = await extractFactsFromConversation(newConv);
        console.log('Extracted facts:', newFacts);
        
        // Merge with existing facts
        const mergedFacts = { ...gameState.extractedFacts };
        Object.entries(newFacts).forEach(([key, value]) => {
          if (key === 'personality_traits' || key === 'interests') {
            // Merge arrays
            mergedFacts[key] = [...new Set([...(mergedFacts[key] || []), ...(Array.isArray(value) ? value : [value])])];
          } else if (key !== 'dragon_opinion') {
            // Overwrite with new value
            mergedFacts[key] = value;
          }
        });
        
        // Create comprehensive summary from all conversations
        const allMessages = newConv
          .filter(c => c.type !== 'system') // Exclude gold notifications
          .map(c => `${c.type === 'user' ? 'Traveler' : 'Dragon'}: ${c.text}`)
          .join(' | ');
        const goldEarned = newGold - gameState.dayStartGold;
        const newMemories = [...gameState.memories, { 
          day: gameState.day, 
          summary: allMessages,
          goldEarned: goldEarned
        }];
        
        // Check if it's day 3 (game ends)
        if (gameState.day >= 3) {
          // Last turn of last day - show dragon's response first
          setGameState(prev => ({
            ...prev,
            conversation: newConv,
            memories: newMemories,
            extractedFacts: mergedFacts,
            relationshipLevel: newRelationship,
            gold: newGold,
            finalTurn: true,
            userInput: '',
            loading: false
          }));
        } else {
          // Day ended, but show conversation and wait for continue button
          setGameState(prev => ({
            ...prev,
            conversation: newConv,
            memories: newMemories,
            extractedFacts: mergedFacts,
            relationshipLevel: newRelationship,
            gold: newGold,
            dayEnded: true,
            userInput: '',
            loading: false
          }));
        }
      } else {
        setGameState(prev => ({
          ...prev,
          turn: newTurn,
          conversation: newConv,
          relationshipLevel: newRelationship,
          gold: newGold,
          userInput: '',
          loading: false
        }));
      }
    } catch (error) {
      console.error('Error communicating with the dragon:', error);
      alert('Error communicating with the dragon: ' + error.message);
      setGameState(prev => ({ ...prev, loading: false }));
    }
  };

  // Show API key setup screen if missing
  if (gameState.apiKeyMissing) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-yellow-700 via-amber-800 to-yellow-900 text-white p-8 flex items-center justify-center">
        <div className="max-w-2xl bg-gray-900 bg-opacity-90 rounded-lg p-8 border-4 border-red-600">
          <h1 className="text-4xl font-bold mb-4 text-red-400">⚠️ API Key Missing</h1>
          <p className="text-yellow-200 mb-4">
            To play this game, you need to set up your Gemini API key.
          </p>
          <div className="bg-gray-800 p-4 rounded mb-4">
            <p className="font-bold mb-2">Instructions:</p>
            <ol className="list-decimal ml-6 space-y-2 text-sm">
              <li>Create a <code className="bg-gray-700 px-2 py-1 rounded">config.js</code> file</li>
              <li>Add your API key: <code className="bg-gray-700 px-2 py-1 rounded">window.GEMINI_API_KEY = "your-key-here"</code></li>
              <li>Get your API key from: <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-400 underline">Google AI Studio</a></li>
              <li>Refresh this page</li>
            </ol>
          </div>
          <p className="text-sm text-gray-400">
            See README_GEMINI_SECURE.md for detailed instructions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-yellow-700 via-amber-800 to-yellow-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-2 text-yellow-300">🐉 Dragon's Hoard 🐉</h1>
        <p className="text-center text-yellow-200 mb-6">
          Spend the next 3 days (3 turns each) chatting with the dragon! Win the dragon's favor and it might reward you with treasure.
        </p>
        
        {!gameState.gameOver ? (
          <>
            <div className="bg-yellow-800 bg-opacity-60 rounded-lg p-4 mb-4 border-2 border-yellow-600">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xl">Day {gameState.day} | Turn {gameState.turn + 1}/3</p>
                <div className="flex gap-4 items-center">
                  <p className={`text-lg font-bold ${
                    gameState.relationshipLevel > 5 ? 'text-green-400' :
                    gameState.relationshipLevel < -5 ? 'text-red-400' :
                    gameState.relationshipLevel > 0 ? 'text-green-300' :
                    gameState.relationshipLevel < 0 ? 'text-red-300' :
                    'text-gray-400'
                  }`}>
                    {gameState.relationshipLevel > 5 ? '😊' :
                     gameState.relationshipLevel < -5 ? '😠' :
                     gameState.relationshipLevel > 0 ? '🙂' :
                     gameState.relationshipLevel < 0 ? '😐' :
                     '😶'} Dragon's Mood
                  </p>
                  <p className={`text-2xl font-bold ${gameState.gold < 0 ? 'text-red-400' : 'text-yellow-300'}`}>
                    💰 {gameState.gold} Gold
                  </p>
                </div>
              </div>
              
              {(gameState.memories.length > 0 || Object.keys(gameState.extractedFacts).length > 0) && (
                <div className="mt-2 text-sm text-yellow-200">
                  {Object.keys(gameState.extractedFacts).length > 0 && (
                    <div className="mb-2">
                      <p className="font-bold">Dragon knows about you:</p>
                      {Object.entries(gameState.extractedFacts).map(([key, value]) => (
                        <p key={key} className="ml-2">• {key.replace(/_/g, ' ')}: {Array.isArray(value) ? value.join(', ') : value}</p>
                      ))}
                    </div>
                  )}
                  {gameState.memories.length > 0 && (
                    <div>
                      <p className="font-bold">Previous Days:</p>
                      {gameState.memories.map(m => (
                        <p key={m.day}>Day {m.day}: Earned {m.goldEarned > 0 ? '+' : ''}{m.goldEarned} gold</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="bg-gray-900 bg-opacity-80 rounded-lg p-4 mb-4 h-64 overflow-y-auto border-2 border-yellow-700">
              {gameState.conversation.length === 0 ? (
                <p className="text-gray-400 italic">The dragon watches you from atop its golden mountain...</p>
              ) : (
                gameState.conversation.map((msg, i) => (
                  <div key={i} className={`mb-3 ${
                    msg.type === 'user' ? 'text-blue-300' : 
                    msg.type === 'system' ? 'text-yellow-300 font-bold text-center' :
                    'text-yellow-400'
                  }`}>
                    {msg.type !== 'system' && <span className="font-bold">{msg.type === 'user' ? 'You' : 'Dragon'}:</span>} {msg.text}
                  </div>
                ))
              )}
            </div>
            
            {gameState.dayEnded ? (
              <div className="text-center">
                <p className="text-yellow-200 mb-4 text-lg">Day {gameState.day} has ended.</p>
                <button
                  onClick={continueToNextDay}
                  className="bg-yellow-600 hover:bg-yellow-700 px-8 py-3 rounded font-bold text-lg shadow-lg"
                >
                  Continue to Day {gameState.day + 1}
                </button>
              </div>
            ) : gameState.finalTurn ? (
              <div className="text-center">
                <p className="text-yellow-200 mb-4 text-lg">Your 3 days with the dragon have concluded.</p>
                <button
                  onClick={viewResults}
                  className="bg-yellow-600 hover:bg-yellow-700 px-8 py-3 rounded font-bold text-lg shadow-lg"
                >
                  View Results
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={gameState.userInput}
                  onChange={(e) => setGameState(prev => ({ ...prev, userInput: e.target.value }))}
                  onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="Say something to the dragon..."
                  className="flex-1 bg-gray-700 rounded px-4 py-2 text-white"
                  disabled={gameState.loading}
                />
                <button
                  onClick={handleSubmit}
                  disabled={gameState.loading}
                  className="bg-yellow-600 hover:bg-yellow-700 px-6 py-2 rounded font-bold disabled:opacity-50 shadow-lg"
                >
                  {gameState.loading ? '...' : 'Speak'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="bg-gray-900 bg-opacity-90 rounded-lg p-8 text-center border-4 border-yellow-600">
            <p className="text-6xl mb-4">🐉</p>
            <p className="text-2xl font-bold mb-2 text-yellow-300">Your Journey Ends</p>
            
            {Object.keys(gameState.extractedFacts).length > 0 && (
              <div className="mb-4 text-yellow-200">
                <p className="font-bold mb-1">The dragon will remember you as:</p>
                {gameState.extractedFacts.name && <p>"{gameState.extractedFacts.name}"</p>}
                {gameState.extractedFacts.personality_traits && 
                  <p className="text-sm">{gameState.extractedFacts.personality_traits.join(', ')}</p>}
              </div>
            )}
            
            <p className={`text-lg mb-2 ${
              gameState.relationshipLevel > 5 ? 'text-green-400' :
              gameState.relationshipLevel < -5 ? 'text-red-400' :
              'text-yellow-300'
            }`}>
              {gameState.relationshipLevel > 5 ? '😊 The dragon considers you a friend' :
               gameState.relationshipLevel > 0 ? '🙂 The dragon respects you' :
               gameState.relationshipLevel === 0 ? '😶 The dragon is indifferent' :
               gameState.relationshipLevel > -5 ? '😐 The dragon is wary of you' :
               '😠 The dragon dislikes you greatly'}
            </p>
            
            <p className={`text-3xl font-bold mb-2 ${gameState.gold < 0 ? 'text-red-400' : 'text-yellow-300'}`}>
              💰 {gameState.gold} Gold Coins {gameState.gold < 0 ? '(In Debt!)' : 'Collected!'}
            </p>
            <p className="text-yellow-200">
              {gameState.gold < 0 ? "You owe the dragon gold! You should run..." :
               gameState.gold === 0 ? "The dragon gave you nothing..." : 
               gameState.gold < 2000 ? "A modest haul from the dragon's hoard." :
               gameState.gold < 5000 ? "The dragon was quite generous!" :
               "The dragon showered you with riches!"}
            </p>
            <button
              onClick={() => setGameState({
                day: 1,
                turn: 0,
                gold: 0,
                dayStartGold: 0,
                memories: [],
                extractedFacts: {},
                relationshipLevel: 0,
                conversation: [],
                userInput: '',
                gameOver: false,
                escaped: false,
                loading: false,
                dayEnded: false,
                finalTurn: false,
                apiKeyMissing: !GEMINI_API_KEY
              })}
              className="mt-6 bg-yellow-600 hover:bg-yellow-700 px-6 py-2 rounded font-bold shadow-lg"
            >
              Visit Another Dragon
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
