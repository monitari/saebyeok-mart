// Authored scene definitions are shared by recording, announcements and daily reports.
export const SCENES = {
  umbrella_loan:{title:'비를 피할 작은 친절',preview:'우산 이야기를 나누는 중',cooldown:2880},
  umbrella_return:{title:'잊지 않고 돌려준 우산',preview:'가져온 우산을 건네는 중',cooldown:1440},
  queue_urge:{title:'계산대 앞의 급한 마음',preview:'계산대 앞에서 오가는 말',cooldown:1440},
  line_cut:{title:'줄에서 생긴 실랑이',preview:'계산 순서를 이야기하는 중',cooldown:1440},
  argument:{title:'서로 날이 선 순간',preview:'품절에 대해 이야기하는 중',cooldown:1440},
  reconcile:{title:'다시 건넨 인사',preview:'지난 일을 이야기하는 중',cooldown:1440},
  paid_for:{title:'대신 내 준 작은 돈',preview:'계산을 도와줄지 이야기하는 중',cooldown:2880},
  favor_thanks:{title:'지난번의 고마움',preview:'지난번 일을 꺼내는 중',cooldown:1440},
  restock_promise:{title:'다음 방문을 위한 약속',preview:'다음 입고를 물어보는 중',cooldown:1440},
  promise_kept:{title:'약속한 물건이 왔어요',preview:'맡겨 둔 물건을 찾는 중',cooldown:720},
  promise_missed:{title:'엇갈린 약속',preview:'입고를 다시 확인하는 중',cooldown:1440},
  friend_share:{title:'함께 나누는 간식',preview:'먹을 것을 나누는 중',cooldown:1440},
  kid_candy:{title:'사탕 앞에서의 고민',preview:'사탕을 고르는 중',cooldown:1440},
  kind_words:{title:'잠깐의 다정한 말',preview:'안부를 건네는 중',cooldown:1440},
  slipped:{title:'미끄러운 입구',preview:'입구에서 잠깐 멈춘 손님',cooldown:1440},
  shift_change:{title:'밤을 넘기는 인수인계',preview:'알바생이 인수인계하는 중',cooldown:720},
  life_news:{title:'달라진 일상의 시간표',preview:'근황을 나누는 중',cooldown:2880},
  seat_yield:{title:'조금 비켜 준 자리',preview:'통로에서 잠깐 양보하는 중',cooldown:1440},
  tobacco_check:{title:'계산대 뒤에서 꺼낸 물건',preview:'알바생이 상품을 확인하는 중',cooldown:2880},
  tobacco_refused:{title:'신분 확인 뒤의 안내',preview:'신분을 확인하는 중',cooldown:1440},
  kiosk_help:{title:'멈춘 셀프 계산대',preview:'셀프 계산대 앞에서 기다리는 중',cooldown:1440},
  parcel_pickup:{title:'기다리던 택배',preview:'택배를 찾는 중',cooldown:1440},
  trouble_refund_demand:{title:'영수증 없는 환불',preview:'환불 이야기를 하는 중',cooldown:1440},
  trouble_walkout:{title:'계산을 잊은 손님',preview:'나가던 손님을 부르는 중',cooldown:1440},
  trouble_drunk:{title:'취식대에서 잠든 손님',preview:'잠든 손님을 깨우는 중',cooldown:1440},
  trouble_umbrella_lost:{title:'돌아오지 않은 우산',preview:'빌려 간 우산을 묻는 중',cooldown:2880},
  trouble_opened:{title:'뜯어 놓은 과자',preview:'뜯은 상품 이야기를 하는 중',cooldown:1440},
  trouble_noisy:{title:'시끄러운 학생들',preview:'학생들이 떠드는 중',cooldown:1440},
  trouble_seat:{title:'오래 앉아 있던 자리',preview:'자리 이야기를 하는 중',cooldown:1440}
};
export const EFFECT_TYPES = {loanUmbrella:'umbrella_loan',returnUmbrella:'umbrella_return',restockPromise:'restock_promise',keepPromise:'promise_kept',paidFor:'paid_for',favorThanks:'favor_thanks',argument:'argument',reconcile:'reconcile',kindWords:'kind_words',lifeNews:'life_news',tobaccoGive:'tobacco_check',parcelOut:'parcel_pickup',refund:'trouble_refund_demand',umbrellaLost:'trouble_umbrella_lost'};
export const KIND_TYPES = {queue_urge:'queue_urge',line_cut:'line_cut',reconcile:'reconcile',slip:'slipped',kid_candy:'kid_candy',handover:'shift_change',life_news:'life_news',yield:'seat_yield',tobacco:'tobacco_check',kiosk:'kiosk_help',trouble_walkout:'trouble_walkout',trouble_drunk:'trouble_drunk',trouble_opened:'trouble_opened',trouble_noisy:'trouble_noisy',trouble_seat:'trouble_seat'};
