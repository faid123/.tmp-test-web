using System.Collections;
using System.Collections.Generic;
using UnityEngine;

[CreateAssetMenu(fileName = "Multi Sprite RPD Component", menuName = "Component/New Multi Sprite RPD Component")]
public class MultiSpriteRPDComponent : RPDComponent
{
	//protected virtual List<GameObject> DisplayAllSprites(Visuals visuals, PlacementData placementData)
	//{
	//    List<GameObject> spriteGameObjects = new List<GameObject>();

	//    foreach (SpriteData spriteData in visuals.sprites)
	//    {
	//        //display sprites
	//        DisplaySingleSprite(spriteData, placementData, out GameObject spriteGameObj);
	//        spriteGameObjects.Add(spriteGameObj);
	//    }

	//    return spriteGameObjects;
	//}

	protected override void HandlePlacingSprites(PlacementData placementData, out List<GameObject> spriteGameObjects)
	{
		spriteGameObjects = null;

		//find the patch ID of the tooth
		//the patch ID will correspond to the entry number in the visuals array
		int spriteIndex = Utils.ToothFDIIDToComponentVisualsSpriteID(placementData.selectedToothFDIIndex, out Jaw_Type jawType);

		foreach (ComponentVisuals singleComponentVisuals in componentVisuals)
		{
			PlaceSprite(placementData, jawType, singleComponentVisuals, spriteIndex, out GameObject spriteGameObject);

			if (spriteGameObjects == null)
				spriteGameObjects = new List<GameObject>();

			spriteGameObjects.Add(spriteGameObject);
		}
	}
}
