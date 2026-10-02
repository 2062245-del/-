package com.seungho.barointerpreter;

public final class TravelMateRegressionTest {
    private static int pass = 0;
    private static void expect(String name, boolean ok) {
        if (!ok) throw new AssertionError(name);
        pass++;
        System.out.println("PASS: " + name);
    }

    public static void main(String[] args) {
        String ac = TravelTranslationQuality.curated("너무 더운데 에어컨 좀 켜 주세요", "ko", "vi");
        expect("aircon curated", ac != null && ac.toLowerCase().contains("điều hòa"));

        String coffee = TravelTranslationQuality.curated("아이스 아메리카노 두 잔 카페라떼 두 잔 주세요", "ko", "vi");
        expect("multi item coffee order", coffee != null && coffee.contains("Americano") && coffee.toLowerCase().contains("latte"));

        expect("broken short translation rejected",
                !TravelTranslationQuality.isMeaningSafe("너무 더운데 에어컨 좀 켜 주세요", "Quá nhiều nóng,", "ko", "vi"));

        TranslationVerification.Report clean = TranslationVerification.inspect(
                "아이스 아메리카노 2잔 주세요",
                "Cho tôi 2 ly Americano đá.",
                "아이스 아메리카노 2잔 주세요."
        );
        expect("verification good round trip", !clean.caution);

        TranslationVerification.Report numberLoss = TranslationVerification.inspect(
                "맥주 3병 주세요",
                "Cho tôi bia.",
                "맥주 주세요."
        );
        expect("verification number loss", numberLoss.caution);

        TranslationVerification.Report properName = TranslationVerification.inspect(
                "Starbucks Americano 주세요",
                "Cho tôi cà phê.",
                "커피 주세요."
        );
        expect("verification proper token loss", properName.caution);

        TranslationVerification.Report negation = TranslationVerification.inspect(
                "고수 빼 주세요",
                "Cho tôi món này.",
                "이것 주세요."
        );
        expect("verification negation loss", negation.caution);

        TranslationVerification.Report collapsed = TranslationVerification.inspect(
                "호텔 프런트에 제 가방을 맡기고 오후 세 시에 다시 찾으러 올게요",
                "Tôi sẽ quay lại.",
                "다시 올게요"
        );
        expect("verification collapsed reverse", collapsed.caution);

        System.out.println("TOTAL PASS=" + pass);
    }
}
