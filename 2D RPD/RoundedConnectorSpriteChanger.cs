using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

public class RoundedConnectorSpriteChanger : MonoBehaviour
{
	public enum RoundedEnds
	{
		None,
		Left, //for central objects
		Right, //for central objects
		Both
	}

	[SerializeField]
	Image imageToChange;

	[SerializeField]
	Sprite noRounding;

	[SerializeField]
	Sprite leftRounded;

	[SerializeField]
	Sprite rightRounded;

	[SerializeField]
	Sprite bothRounded;

	[SerializeField]
	bool returnToUnroundedSpriteOnDisable = true;

	public void ReturnToUnrounded()
	{
		SetRounding(RoundedEnds.None);
	}

	public void SetRounding(RoundedEnds roundedEnds)
	{
		Sprite newSprite = null;

		switch(roundedEnds)
		{
			case RoundedEnds.None:
				newSprite = noRounding;
				break;
			case RoundedEnds.Left:
				newSprite = leftRounded;
				break;
			case RoundedEnds.Right:
				newSprite = rightRounded;
				break;
			case RoundedEnds.Both:
				newSprite = bothRounded;
				break;
			default:
				Debug.LogError($"Unable to round ends. Unhandled rounding type of {roundedEnds}.");
				return;
		}

		imageToChange.sprite = newSprite;
	}

	private void OnDisable()
	{
		if (returnToUnroundedSpriteOnDisable)
			SetRounding(RoundedEnds.None);
	}
}
