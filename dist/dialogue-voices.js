// Authored registers, not mechanical removal of Korean honorific endings.
export const EXTRA_LINES={
  greet_familiar:{formal:['안녕하세요. 잠깐 들렀어요.','또 뵙네요.'],rude:['왔어.','또 왔네.'],elder:['나 또 들렀어요.','오늘도 수고해요.']},
  pay_hand:{formal:['여기 놓을게요.','이걸로 부탁드려요.','계산 부탁드릴게요.'],rude:['이것 좀 찍어.','이걸로 해.','여기 놨어.'],elder:['이것들 부탁해요.','이것 좀 봐 줘요.']},
  bag_no:{rude:['그냥 들고 갈게.','봉투 필요 없어.']},
  bag_yes:{rude:['봉투에 넣어.','봉투 하나 줘.']},
  price_q:{rude:['이거 얼마야?','얼마라고?']},
  discount_ask:{rude:['좀 깎아 줘.','이거 할인 안 해?']},
  discount_after:{rude:['됐어. 그냥 줘.','알았어. 그대로 해.']},
  extra_ask:{rude:['젓가락 좀 더 줘.','봉투 하나 더.']},
  thanks_big:{rude:['고맙네.','어, 고마워.'],casual:['고마워. 다음엔 내가 살게.']},
  heat_yes:{rude:['데워 줘.','어, 따뜻하게.']},
  heat_no:{rude:['그대로 줘.','그냥 가져갈게.']},
  kind_words:{elder:['끼니는 거르지 말아요.','서 있느라 다리 아프겠어요.','잠깐이라도 쉬어요.']},
  meet_greet:{casual:['어, 너도 왔어?','여기 있었네.','뭐 사러 왔어?']},
  meet_reply:{casual:['응, 잠깐 들렀어.','그냥 구경 중이야.','너도 뭐 사게?']},
  coworker_reply:{casual:['일단 먹고 생각하자.','그러니까. 배부터 채우자.'],formal:['일단 좀 먹고 가요.','먹으면서 생각해요.']},
  welcome:{worker:['어서 오세요.','안녕하세요. 어서 오세요.']},
  thank_bye:{worker:['감사합니다. 조심히 가세요.','감사합니다. 또 오세요.']},
  total:{worker:['모두 {price}원입니다.','합해서 {price}원이에요.']},
  confirm:{casual:['응.','맞아.','그렇지.'],formal:['네, 맞아요.'],rude:['그래.','맞아.']}
};
export const VOICE_CONTEXT={
  welcome:[
    {reg:'worker',when:{who:'yuna'},t:'어서 오세요. 천천히 보세요.'},
    {reg:'worker',when:{who:'jae'},t:'어서 오세요.'},
    {reg:'worker',when:{who:'taeo'},t:'안녕하세요! 어서 오세요.'}
  ],
  total:[
    {reg:'worker',when:{who:'yuna'},t:'{price}원 나왔어요.'},
    {reg:'worker',when:{who:'jae'},t:'{price}원입니다.'},
    {reg:'worker',when:{who:'taeo'},t:'다 해서 {price}원이요!'}
  ],
  friend_food_q:[
    {reg:'casual',when:{rainy:true},t:'비 오니까 뜨거운 거 먹을까?',topic:'warm'},
    {reg:'casual',when:{tod:['night','dawn']},t:'이 시간에 먹으면 너무 늦나?',topic:'late_food'},
    {reg:'casual',when:{},t:'너 뭐 먹을지 골랐어?',topic:'choose'}
  ],
  friend_food_a:[
    {reg:'casual',when:{topic:'warm'},t:'응, 라면 괜찮겠다.'},
    {reg:'casual',when:{topic:'warm'},t:'난 그냥 간식 먹을래.'},
    {reg:'casual',when:{topic:'late_food'},t:'배고픈데 어떡해. 조금만 먹자.'},
    {reg:'casual',when:{topic:'late_food'},t:'난 간단하게 먹으려고.'},
    {reg:'casual',when:{topic:'choose'},t:'아직. 좀 더 보자.'},
    {reg:'casual',when:{topic:'choose'},t:'고르는 게 제일 어렵네.'}
  ]
};
