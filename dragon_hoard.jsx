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
    escaped: false,
    loading: false,
    dayEnded: false,
    finalTurn: false
  });

  const getDragonResponse = async (userInput) => {
    const { day, turn, memories } = gameState;
    
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
    
    const prompt = `You are an ancient dragon sitting atop a massive mountain of gold coins. A traveler has discovered your lair.

Character traits:
- You're wise, greedy, and unpredictable
- You might be generous or stingy depending on how the traveler treats you
- Each turn, you decide to give gold coins or take coins back based on their words
- You respond in MAX 2 SENTENCES
- You have an excellent memory and remember previous conversations with this traveler
- ANSWER THE TRAVELER'S QUESTIONS directly and conversationally - don't ignore what they ask
- Be a real character with personality, preferences, and opinions

Current situation: Day ${day}, Turn ${turn + 1}/3
${memoryContext ? `\nIMPORTANT - You remember these past conversations with this traveler:${memoryContext}\n\nUse this information to maintain consistency and reference past interactions.` : ''}

Traveler says: "${userInput}"

CRITICAL: Respond with ONLY a valid JSON object in this exact format:
{
  "gold": <integer number of gold coins, positive to give, negative to take>,
  "message": "<your 2-sentence response to the traveler - ANSWER their question if they asked one>"
}

Example responses:
{"gold": 1247, "message": "Your words amuse me, mortal. Take these coins as a token of my favor."}
{"gold": -683, "message": "Your insolence displeases me! I take back some of my generosity."}
{"gold": 0, "message": "You speak neither wisdom nor folly. I shall wait to judge you further."}
{"gold": 5721, "message": "I feast on mountain sheep and the occasional knight. Your curiosity pleases me, have these coins."}
{"gold": -4219, "message": "You dare speak to me thus? Your debt grows deeper!"}

Use varied amounts - not just multiples of 100. Be creative with the gold amounts based on your mood.
REMEMBER: Actually answer questions the traveler asks you!

DO NOT include anything outside the JSON object. Your entire response must be valid JSON only.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 150,
        messages: [{ role: "user", content: prompt }]
      })
    });
    
    const data = await response.json();
    return data.content[0].text;
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
      
      try {
        // Strip markdown code blocks if present
        let cleanMsg = dragonMsg.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        dragonResponse = JSON.parse(cleanMsg);
        goldChange = dragonResponse.gold || 0;
        dragonText = dragonResponse.message;
      } catch (parseError) {
        console.error('Failed to parse dragon JSON:', parseError);
        console.log('Raw response:', dragonMsg);
        // Fallback to treating as plain text
        dragonText = dragonMsg;
        goldChange = 0;
      }
      
      newConv.push({ type: 'dragon', text: dragonText });
      
      console.log('Dragon gold change:', goldChange);
      console.log('Dragon message:', dragonText);
      console.log('Current gold:', gameState.gold, '→ New gold:', gameState.gold + goldChange);
      
      const newGold = gameState.gold + goldChange;
      
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
          gold: newGold,
          userInput: '',
          loading: false
        }));
      }
    } catch (error) {
      console.error(error);
      alert('Error communicating with the dragon: ' + error.message);
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
                <p className={`text-2xl font-bold ${gameState.gold < 0 ? 'text-red-400' : 'text-yellow-300'}`}>
                  💰 {gameState.gold} Gold
                </p>
              </div>
              {gameState.memories.length > 0 && (
                <div className="mt-2 text-sm text-yellow-200">
                  <p className="font-bold">Previous Days:</p>
                  {gameState.memories.map(m => (
                    <p key={m.day}>Day {m.day}: Earned {m.goldEarned > 0 ? '+' : ''}{m.goldEarned} gold</p>
                  ))}
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
            <p className={`text-3xl font-bold mb-2 ${gameState.gold < 0 ? 'text-red-400' : 'text-yellow-300'}`}>
              💰 {gameState.gold} Gold Coins {gameState.gold < 0 ? '(In Debt!)' : 'Collected!'}
            </p>
            <p className="text-yellow-200">
              {gameState.gold < 0 ? "You owe the dragon gold! You should run..." :
               gameState.gold === 0 ? "The dragon gave you nothing..." : 
               gameState.gold < 50 ? "A modest haul from the dragon's hoard." :
               gameState.gold < 100 ? "The dragon was quite generous!" :
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
                finalTurn: false
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
