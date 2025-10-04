

const randomiseOptions = async (result) => {
    const {questions} = result;
    let i = 0;
    for(i = 0; i < questions.length; ++i) {
        const correctInd = questions[i].answer;
        const exchangeInd = Math.floor(1234.0*Math.random()) % 4;
        const correctOpt = questions[i].options[correctInd];
        const exchangeOpt = questions[i].options[exchangeInd];
        
        questions[i].options[exchangeInd] = correctOpt;
        questions[i].options[correctInd] = exchangeOpt;
        questions[i].answer = exchangeInd;
    }
    return {questions : questions};
};

export default randomiseOptions;