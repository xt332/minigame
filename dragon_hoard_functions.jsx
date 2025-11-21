import React, { useState } from 'react';

export default function DragonHoard() {
  const [gameState, setGameState] = useState({
    day: 1,
    turn: 0,
    gold: 0,
    dayStartGold: 0,
    memories: [],
    conversation: [],
    userInput: '',
    gameOver: false,
    loading: false,
    dayEnded: false,
    finalTurn: false,
    relationshipLevel: 0
  });

  const callGemini = async (prompt, temperature = 0.9, maxTokens = 200) => {
    // Call Netlify Function instead of Gemini directly
    const response = await fetch('/.netlify/functions/get-dragon-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, temperature, maxTokens })
    });

    if (!response.ok) {
      throw new Error('Failed to get dragon response');
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  };

  const getDragonResponse = async (userInput) => {
    const { day, turn, memories, relationshipLevel, conversation } = gameState;
    
    let fullHistory = '';
    if (memories.length > 0) {
      fullHistory = '\n\n=== PAST DAYS ===\n' + memories.map(m => 
        `\n--- Day ${m.day} ---\n${m.conversation.map(msg => 
          `${msg.type === 'user' ? 'Traveler' : 'Dragon'}: ${msg.text}`
        ).join('\n')}\n(Gold earned: ${m.goldEarned})`
      ).join('\n');
    }
    
    let todayHistory = '';
    if (conversation.length > 0) {
      todayHistory = '\n\n=== TODAY SO FAR ===\n' + conversation
        .filter(c => c.type !== 'system')
        .map(msg => `${msg.type === 'user' ? 'Traveler' : 'Dragon'}: ${msg.text}`)
        .join('\n');
    }
    
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
- ANSWER THE TRAVELER'S QUESTIONS directly and conversationally
- Be a real character with personality, preferences, and opinions
- Reference past conversations naturally${relationshipContext}

Current situation: Day ${day}, Turn ${turn + 1}/3
Relationship level: ${relationshipLevel}/10
${fullHistory}${todayHistory}

Traveler's new message: "${userInput}"

CRITICAL: Respond with ONLY a valid JSON object:
{
  "gold": <integer coins to give/take>,
  "message": "<your 2-sentence response>",
  "relationship_change": <-3 to +3>
}

Examples:
{"gold": 1247, "message": "Your words amuse me, mortal. Take these coins as a token of my favor.", "relationship_change": 1}
{"gold": -683, "message": "Your insolence displeases me! I take back some of my generosity.", "relationship_change": -2}
{"gold": 5721, "message": "I feast on mountain sheep and knights. Your curiosity pleases me.", "relationship_change": 2}

Use varied amounts. Answer their questions! Reference past conversations!
DO NOT include anything outside the JSON object.`;

    return await callGemini(prompt);
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
      
      let dragonResponse;
      let goldChange = 0;
      let dragonText = dragonMsg;
      let relationshipChange = 0;
      
      try {
        let cleanMsg = dragonMsg.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        dragonResponse = JSON.parse(cleanMsg);
        goldChange = dragonResponse.gold || 0;
        dragonText = dragonResponse.message;
        relationshipChange = dragonResponse.relationship_change || 0;
      } catch (parseError) {
        console.error('Failed to parse dragon JSON:', parseError);
        dragonText = dragonMsg;
        goldChange = 0;
        relationshipChange = 0;
      }
      
      newConv.push({ type: 'dragon', text: dragonText });
      
      const newGold = gameState.gold + goldChange;
      const newRelationship = Math.max(-10, Math.min(10, gameState.relationshipLevel + relationshipChange));
      
      if (goldChange !== 0) {
        newConv.push({ 
          type: 'system', 
          text: `💰 ${goldChange > 0 ? '+' : ''}${goldChange} gold coins (Total: ${newGold})`
        });
      }
      
      const newTurn = gameState.turn + 1;
      
      if (newTurn >= 3) {
        const goldEarned = newGold - gameState.dayStartGold;
        const newMemories = [...gameState.memories, { 
          day: gameState.day,
          conversation: newConv.filter(c => c.type !== 'system'),
          goldEarned: goldEarned
        }];
        
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
      alert('Error: ' + error.message + '\n\nMake sure GEMINI_API_KEY is set in Netlify environment variables.');
      setGameState(prev => ({ ...prev, loading: false }));
    }
  };

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
                loading: false,
                dayEnded: false,
                finalTurn: false,
                relationshipLevel: 0
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