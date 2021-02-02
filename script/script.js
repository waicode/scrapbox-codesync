// 引用時にインデントマークを消す
let textSpans = document.getElementsByClassName('text');
let textSpansList = Array.from( textSpans );
textSpansList.forEach(textSpan => {
        const indentSpan = textSpan.querySelector('.indent');
        if(indentSpan != null) {
            if(indentSpan.getElementsByClassName('quote').length > 0) {
                textSpan.querySelector('.indent-mark .dot').style.display = 'none';     		
            }
        }
    }
);