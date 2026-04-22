const GLOBAL: i32 = 2;

trait HasConst {
    const TRAIT_VALUE: i32 = 7;

    fn trait_value() -> i32;
}

struct Counter;

impl Counter {
    const INHERENT_VALUE: i32 = GLOBAL + 3;

    fn inherent_value() -> i32 {
        Self::INHERENT_VALUE
    }
}

impl HasConst for Counter {
    fn trait_value() -> i32 {
        Self::TRAIT_VALUE
    }
}

#[test]
fn test_example() {
    const LOCAL: i32 = Counter::INHERENT_VALUE + Counter::TRAIT_VALUE;

    assert_eq!(GLOBAL, 2);
    assert_eq!(Counter::INHERENT_VALUE, 5);
    assert_eq!(Counter::TRAIT_VALUE, 7);
    assert_eq!(Counter::trait_value(), 7);
    assert_eq!(Counter::inherent_value(), 5);
    assert_eq!(LOCAL, 12);
    println!("{}", LOCAL);
}
